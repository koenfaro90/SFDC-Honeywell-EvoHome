Retrieve Honeywell EvoHome data and Store in Salesforce
---------
Written in NodeJS

Steps:

1. Create a config.json file like:
```
{
	"interval": "60000",
	"logFile": "app.log",
	"honeywell": {
		"username": "<username>",
		"password": "<password>"
	},
	"salesforce": {
		"url": "https://login.salesforce.com",
		"username": "<username>",
		"password": "<password>"
	}
}
```

2. Create the following objects in SF org
```
Temp_Zone__c:
ZoneID__c: Text, External ID

Temp_Log__c:
SetPointMode__c: Picklist()
TargetTemperature__c: Number(2,1)
Temperature__c: Number(2,1)
TempZone__c: Lookup(Temp_Zone__c)
```
3. Run 'npm install' in the cloned directory
4. Run 'node app.js' or 'forever app.js' if you are using forever