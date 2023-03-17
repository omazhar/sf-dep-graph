const sfdcSoup = require('sfdc-soup');
const fs = require('fs-extra');
const puppeteer = require('puppeteer');
const arg = require('arg');

(async () => {

    // PRE-REQUISITE
    // Switch to Classic Mode

    const args = arg({
        '--sbxUrl': String,
        '--accessToken': String,
        '--objName': String,
        '--objType': String,
        '--objId': String,
        '--outputDir': String
    })

    const connection = {
        token: args['--accessToken'],
        url: args['--sbxUrl'],
        apiVersion: '56.0'
    }

    const entryPoint = {
        name: args['--objName'],
        type: args['--objType'],
        id: args['--objId'],
        references: [],
        usages: []
    }
        
    const soupApi = sfdcSoup(connection,entryPoint);

    const dependencyResponse = await soupApi.getDependencies();
    const dependencyTree = await dependencyResponse.dependencyTree;
    
    const usageResponse = await soupApi.getUsage();
    const usageTree = await usageResponse.usageTree;

    const browser = await initializeBrowser();
    const browserPage = await getHomePage(browser, connection);

    if (Object.keys(dependencyTree).length > 0) {
        await processReferences(browserPage, entryPoint, dependencyTree);
    }

    if (Object.keys(usageTree).length > 0) {
        await processUsages(browserPage, entryPoint, usageTree);
    }

    await browser.close();

    exportJSON(entryPoint, args['--outputDir']);

    exportCypher(entryPoint, args['--outputDir']);

})();

async function processReferences(browserPage, entryPoint, dependencyTree) {

    console.log(`Getting dependencies for ${entryPoint.name}...`)

    const rootKey = Object.keys(dependencyTree)[0];

    const mTypes = Object.keys(dependencyTree[rootKey]['references']);

    for (let i = 0; i < mTypes.length; i++) {
        let mDatas = dependencyTree[rootKey]['references'][mTypes[i]];
        for (let j = 0; j < mDatas.length; j++) {
            await populateReferencesInEntryPoint(entryPoint.references, browserPage, mDatas[j].name, mDatas[j].id, mDatas[j].type, mDatas[j].url);
        }
    }

}

async function processUsages(browserPage, entryPoint, usageTree) {

    console.log(`Getting usages of ${entryPoint.name}...`)

    const mTypes = Object.keys(usageTree);

    for (let i = 0; i < mTypes.length; i++) {
        let mDatas = usageTree[mTypes[i]];
        for (let j = 0; j < mDatas.length; j++) {
            await populateReferencesInEntryPoint(entryPoint.usages, browserPage, mDatas[j].name, mDatas[j].id, mDatas[j].type, mDatas[j].url);
        }
    }

}

async function populateReferencesInEntryPoint(entryPointReferences, browserPage, mDataName, mDataId, mDataType, mDataUrl) {

    const IGNORE_METADATA = [
        'AssignmentRule',
        'CustomNotificationType',
        'CustomPermission',
        'EmailTemplate',
        'PermissionSet',
        'PermissionSetGroup',
        'PermissionSetLicense',
        'Profile',
        'Queue',
        'RecordType',
        'Report',
        'Role',
        'Skill',
        'User',
        'UserLicense'
    ]

    // ignore certain mDataType
    if (IGNORE_METADATA.includes(mDataType)) {
        return;
    }

    // remove id from name
    // CEC_UX_VehicleOverviewFSC.4:::0Ab1C000000TdVoSAK
    let trimmedName = mDataName
    if (trimmedName.includes(':::')) {
        trimmedName = mDataName.split(':::')[0];
    }

    // remove aura component version number
    // CEC_UX_VehicleOverviewFSC.2
    if (mDataType === 'AuraDefinitionBundle' && trimmedName.includes('.')) {
        trimmedName = trimmedName.split('.')[0];
    }

    // remove flow component version number
    // FSL_Curbside-10
    if (mDataType === 'Flow' && trimmedName.includes('-')) {
        trimmedName = trimmedName.split('-')[0];
    }

    const packageName = await getPackageName(browserPage, trimmedName, mDataType, mDataUrl);

    if (packageName != null) {
        console.log(`Found ${mDataName} in package ${packageName}`)
        if (!alreadyHasReference(entryPointReferences, packageName)) {
            entryPointReferences.push({
                name: packageName,
                type: 'package',
                //ref: mDataName,
                id: null,
                url: null
            })
        }
    }
    else {
        console.log(`Found reference to ${mDataType} ${trimmedName}`)
        if (!alreadyHasReference(entryPointReferences, trimmedName)) {
            entryPointReferences.push({
                name: trimmedName,
                type: mDataType,
                id: mDataId,
                url: mDataUrl
            })
        }
    }

}

async function initializeBrowser() {

    const browser = await puppeteer.launch({
        headless: true,
    });

    return browser

}

async function getHomePage(browser, connection) {

    const page = await browser.newPage();
    await page.setViewport({width: 1920, height: 1080});

    const loginUrl = `${connection.url}/secur/frontdoor.jsp?sid=${connection.token}`;

    await page.goto(loginUrl);

    await delay(2000);

    return page;

}

async function getPackageName(page, objName, objType, objUrl) {

    const apexClassInstalledPackageXPath = "//label[contains(text(), 'Installed Package')]/parent::*/following-sibling::*/a"
    const customFieldInstalledPackageXPath = "//td[contains(text(), 'Installed Package')]/following-sibling::*/a"

    await page.goto(objUrl);

    await delay(2000)

    let packageName

    try {
        await page.waitForXPath("//*[@id='manageableInfo']", {
            timeout: 2000
        })
        //await page.screenshot({path: 'homepage.png'});
        //console.log(`${objName} is part of package`);

        packageName = 'unknown'

        let installedPackageLink
        
        if (objType === 'CustomField' || objType === 'CustomObject') {
            installedPackageLink = await page.waitForXPath(customFieldInstalledPackageXPath)
        }
        else if (objType === 'ApexClass') {
            installedPackageLink = await page.waitForXPath(apexClassInstalledPackageXPath)
        }
        else {
            return packageName;
        }
        
        packageName = await (await installedPackageLink.getProperty('innerText')).jsonValue()

        //console.log(`${objName} is part of package ${packageName}`)

        return packageName

    }
    catch (e) {
        return null;
    }

}

function delay(time) {
    return new Promise(function(resolve) { 
        setTimeout(resolve, time)
    });
}

function exportJSON(entryPoint, outputDir) {
    //console.log(JSON.stringify(entryPoint, null, 2));
    fs.writeFileSync(`${outputDir}/${entryPoint.name}-references.json`, JSON.stringify(entryPoint, null, 2))
}

function exportCypher(entryPoint, outputDir) {
    
    let cypherStatements = []
    let nodeNames = [];

    const rootNodeName = replaceDotWithUnderscores(removeDashes(entryPoint.name))
    nodeNames.push(rootNodeName)
    const rootNodeType = entryPoint.type
    const rootNodeId = entryPoint.id

    cypherStatements.push(`MERGE (${rootNodeName}:${rootNodeType} {name: '${rootNodeName}', id: '${rootNodeId}'})`)
    cypherStatements.push(``)

    // references
    const references = entryPoint.references
    for (let i = 0; i < references.length; i++) {
        const nodeName = replaceDotWithUnderscores(removeDashes(references[i].name))
        let nodeType = references[i].type
        if (nodeType === 'Installed Package') {
            nodeType = 'package'
        }
        const nodeId = references[i].id
        const nodeRef = references[i].ref

        if (!nodeNames.includes(nodeName)) {
            cypherStatements.push(`MERGE (${nodeName}:${nodeType} {name: '${nodeName}', id: '${nodeId}'})`)
            nodeNames.push(nodeName);
        }

        if (nodeRef) {
            cypherStatements.push(`MERGE (${rootNodeName})-[:REFERENCES {name: '${nodeRef}'}]->(${nodeName})`)

        }
        else {
            cypherStatements.push(`MERGE (${rootNodeName})-[:REFERENCES]->(${nodeName})`)
        }
        cypherStatements.push(``)
        
    }

    // usages
    const usages = entryPoint.usages
    for (let i = 0; i < usages.length; i++) {
        const nodeName = replaceDotWithUnderscores(removeDashes(usages[i].name))
        const nodeType = usages[i].type
        const nodeId = usages[i].id

        if (!nodeNames.includes(nodeName)) {
            cypherStatements.push(`MERGE (${nodeName}:${nodeType} {name: '${nodeName}', id: '${nodeId}'})`)
            nodeNames.push(nodeName);
        }
        cypherStatements.push(`MERGE (${rootNodeName})<-[:REFERENCES]-(${nodeName})`)
        cypherStatements.push(``)
        
    }

//    console.log(cypherStatements.join('\n'))
    fs.writeFileSync(`${outputDir}/${entryPoint.name}-references.cypher`, cypherStatements.join('\n'))

}

function removeDashes(someString) {
    return someString.replace(/-/g,'')
}

function replaceDotWithUnderscores(someString) {
    return someString.replace(/\./g,'__')
}

function alreadyHasReference(objArray, refName) {
    for (let i = 0; i < objArray.length; i++) {
        if (objArray[i].name === refName) {
            return true
        }
    }
    return false
}
