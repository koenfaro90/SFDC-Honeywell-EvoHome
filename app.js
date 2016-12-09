console.log('hi');
var fs = require('fs');
var request = require('request');
var Promise = require('bluebird');
var _ = require('underscore');
var jsforce = require('jsforce');
var config = JSON.parse(fs.readFileSync('config.json').toString());

process.on('uncaughtException', function(err) {
	console.error('err', err);
})

class EvoHomeClient {
	constructor(username, password) {
		this.username = username;
		this.password = password;
		this.access_token = null;
		this.refresh_token = null;
		this.token_expiration = null;
		this.locationId = null;
		this._login()
			.then(this._storeTokens.bind(this))
			.then(this.getAccountInfo.bind(this))
			.then(this._storeAccountInfo.bind(this))
			.then(this.getInstallations.bind(this))
			.then(this._selectInstallationId.bind(this))
			.then(() => {
				this._cycle();
				setInterval(this._cycle.bind(this), config.interval);
			})
			.catch((err) => {
				console.error('Caught error', err);
			});
	}
	_cycle() {
		this.getStatus.bind(this)
			.then(this._storeInSF.bind(this))
			.catch((err) => {
				console.log('Caught error in cycle', err);
			})
	}
	_login() {
		return new Promise((resolve, reject) => {
			request({
				url: 'https://tccna.honeywell.com/Auth/OAuth/Token',
				method: 'POST',
				headers: {
					'Authorization': 'Basic YjAxM2FhMjYtOTcyNC00ZGJkLTg4OTctMDQ4YjlhYWRhMjQ5OnRlc3Q=',
		            'Accept': 'application/json, application/xml, text/json, text/x-json, text/javascript, text/xml',
		            'Content-Type':	'application/x-www-form-urlencoded; charset=utf-8'
		        },
				form: {
		            'grant_type':	'password',
		            'scope':	'EMEA-V1-Basic EMEA-V1-Anonymous EMEA-V1-Get-Current-User-Account',
		            'Username':	this.username,
		            'Password':	this.password
				},
				strictSSL: false
			}, function(err, httpResponse, body) {
				if (err) {
					return reject(err);
				}
				var jsonBody = JSON.parse(body);
				return resolve(jsonBody);
			});
		});
	}
	_storeTokens(data) {
		return new Promise((resolve, reject) => {
			try {
				this.access_token = data.access_token;
				this.refresh_token = data.refresh_token;
				this.token_expiration = +new Date() + ((data.expires_in - 60) * 1000); // 60 sec margin, to ms
				return resolve();
			} catch(e) {
				return reject(e);
			}
		});
	}
	_request(url) {
		return new Promise((resolve, reject) => {
			request({
				url: url,
		        headers: {
					'applicationId': 'b013aa26-9724-4dbd-8897-048b9aada249',
		            'Authorization': 'bearer ' + this.access_token,
		            'Accept': 'application/json, application/xml, text/json, text/x-json, text/javascript, text/xml',
					'Content-Type':	'application/x-www-form-urlencoded; charset=utf-8'
		        },
				method: 'GET'
			}, function(err, httpResponse, body) {
				if (err) {
					return reject(err);
				} else {
					return resolve(JSON.parse(body));
				}
			});
		});
	}
	_checkLogin() {
		return new Promise((resolve, reject) => {
			if ((+new Date()) > this.token_expiration) {
				// refresh token
				console.error('need to refresh token');
			} else {
				return resolve();
			}
		});
	}
	getAccountInfo() {
		console.log('getAccountInfo');
		return this._checkLogin()
			.then(this._request.bind(this, 'https://tccna.honeywell.com/WebAPI/emea/api/v1/userAccount'))
	}
	_storeAccountInfo(data) {
		console.log('storeAccountInfo', data);
		return new Promise((resolve, reject) => {
			this.account_info = data;
			return resolve();
		});
	}
	getInstallations() {
		console.log('_getInstallations');
		return this._checkLogin()
			.then(this._request.bind(this, 'https://tccna.honeywell.com/WebAPI/emea/api/v1/location/installationInfo?userId='+ this.account_info.userId + '&includeTemperatureControlSystems=True'))

	}
	_selectInstallationId(data) {
		console.log('installations', data, JSON.stringify(data, 0, "\t"));
		return new Promise((resolve, reject) => {
			try {
				this.locationId = data[0].locationInfo.locationId;
				return resolve();
			} catch(e) {
				return reject(e);
			}
		});
	}
	getInstallation() {
		return this._checkLogin()
			.then(this._request.bind(this, 'https://tccna.honeywell.com/WebAPI/emea/api/v1/location/'+ this.locationId + '/installationInfo?includeTemperatureControlSystems=True'))
	}
	getStatus() {
		return this._checkLogin()
			.then(this._request.bind(this, 'https://tccna.honeywell.com/WebAPI/emea/api/v1/location/'+this.locationId + '/status?includeTemperatureControlSystems=True'))
	}
	_storeInSF(data) {
		return new Promise((resolve, reject) => {
			var sfInstance = new StoreInSF(config.salesforce.url, config.salesforce.username, config.salesforce.password);
			sfInstance.store(data)
				.catch((err) => {
					console.error('Error storing data in SF', err);
				})
		});
	}
}

class StoreInSF() {
	constructor(url, username, password) {
		this.url = url;
		this.username = username;
		this.password = password;
		this.conn = null;
	}
	_login() {
		return new Promise((resolve, reject) => {
			this.conn = new jsforce.Connection({
				loginUrl : this.url;
			});
			this.conn.login(this.username, this.password, (err, userInfo) => {
				if (err) {
					console.error('Error logging in to SF');
					return reject(err);
				}
				return resolve();
			});
		})
	}
	store(data) {
		return new Promise((resolve, reject) => {
			this._login()
				.then(() => {
					var items = this._createSObjects(data)
					conn.sobject("Temp_Zone__c").create(
						items,
						function(err, rets) {
						if (err) {
							console.error(err);
							return reject(err);
						}
						_.each(records, (rec) => {
							if (rec.success == false) {
								console.error('Error creating record', rec);
							}
						});
						return resolve();
					});
				})
				.then(resolve)
				.catch(reject)
		});
	}
	_createSObjects(data) {
		var items = [];
		_.each(gateways[0].temperatureControlSystems[0].zones, (zone) {
			items.push(this._createSObject(zone));
		})
		return items;
	}
	_createSObject(zone) {
		return {
			SetPointMode__c: zone.heatSetpointStatus.setpointMode,
			TargetTemperature__c: zone.heatSetpointStatus.targetTemperature,
			Temperature__c: zone.temperatureStatus. temperature,
			'TempZone__r.ZoneID__c': zone.Id
		}
	}
}

var client = new EvoHomeClient(config.honeywell.username, config.honeywell.password);
