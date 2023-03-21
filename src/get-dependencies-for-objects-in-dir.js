const fs = require('fs-extra');
const arg = require('arg');
const { execSync } = require('node:child_process');

(async () => {

    const args = arg({
        '--sbxUrl': String,
        '--sbxUser': String,
        '--accessToken': String,
        '--inputDir': String,
        '--objType': String,
        '--outputDir': String
    })

    const inputFiles = fs.readdirSync(args['--inputDir'])

    const outputFiles = fs.readdirSync(args['--outputDir'])
    let processedObjs = []

    for (let j = 0; j < outputFiles.length; j++) {
        const processedObj = outputFiles[j].split('-')[0]
        if (!processedObjs.includes(processedObj)) {
            processedObjs.push(processedObj)
        }
    }

    console.log(`Already processed ${processedObjs.length} objects`)

    for (let i = 0; i < inputFiles.length; i++) {
        if (inputFiles[i].endsWith('.cls') || inputFiles[i].endsWith('.object')) {
            const objName = inputFiles[i].split('.')[0]

            // check if already processed
            if (!processedObjs.includes(objName)) {
                let retryCount = 1
                const maxRetryCount = 3;
                while (retryCount <= 3) {
                    try {
                        console.log(`\n[${i+1} of ${inputFiles.length}] Processing ${args['--objType']} ${objName} [Attempt ${retryCount} of ${maxRetryCount}]`);
                        processObj(args, objName)
                        break
                    }
                    catch (e) {
                        retryCount++
                    }
                }
            }
            else {
                console.log(`Skipping already processed object ${objName}`)
            }
        }
    }

})();

function processObj(args, objName) {
    const objId = getObjId(args, objName)
    if (objId != -1) {
        getDependencies(args, objName, objId)
    }
    else {
        console.log(`Could not find Id for ${objName}`)
    }
//    console.log(objId)
}

function getObjId(args, objName) {
    var cmd
    if (args['--objType'] == 'ApexClass') {
        cmd = `sfdx force:data:soql:query --json -t -u ${args['--sbxUser']} -q "select id from ApexClass where name=\'${objName}\'"`
    }
    else if (args['--objType'] == 'CustomObject') {
        var modObjName
        if (objName.endsWith('__c')) {
            modObjName = objName.split('__c')[0]
        }
        else {
            modObjName = objName
        }
        cmd = `sfdx force:data:soql:query --json -t -u ${args['--sbxUser']} -q "select id from CustomObject where DeveloperName=\'${modObjName}\'"`
    }
    const resultJson = execSync(cmd).toString()
    const jsonObj = JSON.parse(resultJson)
    if (jsonObj.result.records.length > 0) {
        return jsonObj.result.records[0].Id
    }
    else {
        return -1
    }
}

function getDependencies(args, objName, objId) {
    const cmd = `node src/get-dependencies-for-object.js --sbxUrl '${args['--sbxUrl']}' --accessToken '${args['--accessToken']}' --objName '${objName}' --objType '${args['--objType']}' --objId '${objId}' --outputDir '${args['--outputDir']}'`
    execSync(cmd, {stdio: 'inherit'})
    //console.log(`Running command ${cmd}`)
}
