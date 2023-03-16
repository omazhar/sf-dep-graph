# Overview
The purpose of this library is to visualize using Neo4J, metadata dependencies in a Salesforce Org. This can be extremely useful in trying to determine the Package boundaries for very large and complex Orgs.

The library uses the [sfdc-soup](https://github.com/pgonzaleznetwork/sfdc-soup) library to get the Dependencies and Usages of the metadata. It then determines which of those dependencies are already packaged and creates a dependency to the package instead. This considerably reduces the complexity of the Neo4J Graph that is generated and the Graph is much easier to work it.

The Dependencies and Usages of the metadata are exported in 2 formats:

- JSON
- CYPHER Statements for importing into a Neo4J Database

# Pre-Requisites
1. Install [NodeJs](https://www.nodejs.org)
2. Install [Salesforce CLI](https://developer.salesforce.com/tools/sfdxcli)
3. Install [Neo4J](https://www.neo4j.com)
4. Login to your Salesforce Org and enable Classic Mode
5. Authenticate to your Salesforce Org using the Salesforce CLI
6. Run the following command to get your Salesforce Access Token

    `sfdx org display user -o <YOUR_SALESFORCE_USERNAME> --json`


# Install
Run `npm install`

# Usage

## Dependencies and Usages of an Object
```
npm run object-graph -- \
    
    --sbxUrl <SANDBOX_URL> \

    --accessToken <ACCESS_TOKEN> \

    --objName <OBJECT_NAME> \ # e.g. HelloWorld

    --objType <OBJECT_TYPE> \ # e.g. ApexClass

    --objId <18_CHAR_OBJECT_ID> \

    --outputDir <OUTPUT_DIR> # Make sure directory exists
```

## Dependencies and Usages of all Objects in a Directory
If you have access to the source, e.g., if all your Apex classes where in a filesystem directory, you could run the following command

```
npm run objects-graph -- \

    --sbxUrl <SANDBOX_URL> \

    --sbxUser <SANDBOX_USER> \

    --accessToken <ACCESS_TOKEN> \

    --inputDir <INPUT_DIR> \

    --objType <OBJECT_TYPE> \ # e.g. ApexClass

    --outputDir <OUTPUT_DIR> # Make sure directory exists
```

## Import Dependency and Usage graph into Neo4J
Once the previous command has generated the cypher statement(s), the following script can be used to import multiple cypher statements into a Neo4J database:

```
CYPHER_DIR="" # Use the <OUTPUT_DIR> from the previous command

total_count=$(ls $CYPHER_DIR/*.cypher | wc -l)

counter=1

for cypher_file in $CYPHER_DIR/*.cypher;

do

    echo "Processing [$counter] of [$total_count]: $cypher_file"

    cat $cypher_file | cypher-shell -u neo4j -p '<neo4j-db-name>'

    counter=$[$counter +1]

done
```

# Current Limitations
- The library can determine if a metadata is part of a package, only for the following metadata:
    - ApexClass
    - CustomField
    - CustomObject

- The following types of metadata are EXCLUDED from the Dependency and Usage Graph:
    - AssignmentRule
    - CustomNotificationType
    - CustomPermission
    - EmailTemplate
    - PermissionSet
    - PermissionSetGroup
    - PermissionSetLicense
    - Profile
    - Queue
    - RecordType
    - Report
    - Role
    - Skill
    - User
    - UserLicense
