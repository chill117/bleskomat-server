/*
	Copyright (C) 2020 Bleskomat s.r.o.

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

const assert = require('assert');
const cheerio = require('cheerio');
const coinRates = require('coin-rates');
const crypto = require('crypto');
const https = require('https');
const pem = require('pem');

describe('admin', function() {

	let config, server;
	before(function() {
		config = this.helpers.prepareConfig();
		config.admin.web = true;
		config.admin.password = '2904be08aa871adedb4be91160f4d4a10cb36321;32;16;bceb4bd3444c2be5e3e544891118d5150cc2385232d1787097467aa60993cdd0';// test
		return this.helpers.createServer(config).then(result => {
			server = result;
		});
	});

	after(function() {
		if (server) return server.close({ force: true }).then(() => {
			server = null;
		});
	});

	describe('not logged-in', function() {

		it('GET /admin/settings', function() {
			return this.helpers.request('get', {
				url: `${config.lnurl.url}/admin/settings`,
			}).then(result => {
				const { response, body } = result;
				assert.strictEqual(response.statusCode, 302);
				assert.strictEqual(body, 'Found. Redirecting to /admin/login');
			});
		});
	});

	describe('logged-in', function() {

		let cookie;
		before(function() {
			return this.helpers.request('post', {
				url: `${config.lnurl.url}/admin/login`,
				form: { password: 'test' },
			}).then(result => {
				const { response } = result;
				cookie = response.headers['set-cookie'][0];
				assert.ok(cookie);
			});
		});

		it('GET /admin/settings', function() {
			return this.helpers.request('get', {
				url: `${config.lnurl.url}/admin/settings`,
				headers: { cookie },
			}).then(result => {
				const { response, body } = result;
				assert.strictEqual(response.statusCode, 302);
				assert.strictEqual(body, 'Found. Redirecting to /admin/settings/general');
			});
		});

		it('GET /admin/settings/general', function() {
			return this.helpers.request('get', {
				url: `${config.lnurl.url}/admin/settings/general`,
				headers: { cookie },
			}).then(result => {
				const { response, body } = result;
				assert.strictEqual(response.statusCode, 200);
				const $ = cheerio.load(body);
				assert.match($('.form-title').text(), /General Settings/);
				assert.strictEqual($('form input[name=url]').length, 1);
				assert.strictEqual($('form select[name=defaultExchangeRatesProvider]').length, 1);
				assert.strictEqual($('form select[name=defaultExchangeRatesProvider] option').length, coinRates.providers.length);
			});
		});

		it('GET /admin/settings/login', function() {
			return this.helpers.request('get', {
				url: `${config.lnurl.url}/admin/settings/login`,
				headers: { cookie },
			}).then(result => {
				const { response, body } = result;
				assert.strictEqual(response.statusCode, 200);
				const $ = cheerio.load(body);
				assert.match($('.form-title').text(), /Login Credentials/);
				assert.strictEqual($('form input[name=currentPassword]').length, 1);
				assert.strictEqual($('form input[name=newPassword]').length, 1);
				assert.strictEqual($('form input[name=verifyNewPassword]').length, 1);
			});
		});

		it('GET /admin/settings/lightning', function() {
			return this.helpers.request('get', {
				url: `${config.lnurl.url}/admin/settings/lightning`,
				headers: { cookie },
			}).then(result => {
				const { response, body } = result;
				assert.strictEqual(response.statusCode, 200);
				const $ = cheerio.load(body);
				assert.match($('.form-title').text(), /Lightning Configuration/);
				assert.strictEqual($('form select[name=backend]').length, 1);
				assert.strictEqual($('form input[name="lnd[baseUrl]"]').length, 1);
				assert.strictEqual($('form textarea[name="lnd[cert]"]').length, 1);
				assert.strictEqual($('form textarea[name="lnd[macaroon]"]').length, 1);
			});
		});

		describe('POST /admin/settings/general', function() {

			const validFormData = {
				url: 'http://127.0.0.1:3000',
				defaultExchangeRatesProvider: 'kraken',
			};

			Object.entries({
				url: 'Server Base URL',
				defaultExchangeRatesProvider: 'Exchange Rates Provider',
			}).forEach(([key, label], index) => {
				it(`missing ${label}`, function() {
					let form = JSON.parse(JSON.stringify(validFormData));
					delete form[key];
					return this.helpers.request('post', {
						url: `${config.lnurl.url}/admin/settings/general`,
						headers: { cookie },
						form,
					}).then(result => {
						const { response, body } = result;
						assert.strictEqual(response.statusCode, 400);
						const $ = cheerio.load(body);
						assert.match($('.form-errors').text(), new RegExp(`"${label}" is required`));
					});
				});
			});

			it('valid form data', function() {
				return this.helpers.request('post', {
					url: `${config.lnurl.url}/admin/settings/general`,
					headers: { cookie },
					form: validFormData,
				}).then(result => {
					const { response, body } = result;
					assert.strictEqual(response.statusCode, 200);
					const $ = cheerio.load(body);
					assert.match($('.form-success').text(), /Settings were saved successfully./);
					return this.helpers.readEnv(config.env.filePath).then(env => {
						assert.strictEqual(env.BLESKOMAT_SERVER_URL, validFormData.url);
						assert.strictEqual(env.BLESKOMAT_SERVER_COINRATES_DEFAULTS_PROVIDER, validFormData.defaultExchangeRatesProvider);
					});
				});
			});
		});

		describe('POST /admin/settings/login', function() {

			const validFormData = {
				currentPassword: 'test',
				newPassword: 'test2',
				verifyNewPassword: 'test2',
			};

			Object.entries({
				currentPassword: 'Current Password',
			}).forEach(([key, label], index) => {
				it(`missing ${label}`, function() {
					let form = JSON.parse(JSON.stringify(validFormData));
					delete form[key];
					return this.helpers.request('post', {
						url: `${config.lnurl.url}/admin/settings/login`,
						headers: { cookie },
						form,
					}).then(result => {
						const { response, body } = result;
						assert.strictEqual(response.statusCode, 400);
						const $ = cheerio.load(body);
						assert.match($('.form-errors').text(), new RegExp(`"${label}" is required`));
					});
				});
			});

			it('incorrect current password', function() {
				return this.helpers.request('post', {
					url: `${config.lnurl.url}/admin/settings/login`,
					headers: { cookie },
					form: Object.assign({}, validFormData, {
						currentPassword: 'incorrect',
					}),
				}).then(result => {
					const { response, body } = result;
					assert.strictEqual(response.statusCode, 400);
					const $ = cheerio.load(body);
					assert.match($('.form-errors').text(), /"Current Password" was incorrect/);
				});
			});

			it('new password mis-match', function() {
				return this.helpers.request('post', {
					url: `${config.lnurl.url}/admin/settings/login`,
					headers: { cookie },
					form: Object.assign({}, validFormData, {
						verifyNewPassword: `x${validFormData.newPassword}`,
					}),
				}).then(result => {
					const { response, body } = result;
					assert.strictEqual(response.statusCode, 400);
					const $ = cheerio.load(body);
					assert.match($('.form-errors').text(), /"Verify New Password" must match "New Password"/);
				});
			});

			it('valid form data', function() {
				return this.helpers.request('post', {
					url: `${config.lnurl.url}/admin/settings/login`,
					headers: { cookie },
					form: validFormData,
				}).then(result => {
					const { response, body } = result;
					assert.strictEqual(response.statusCode, 200);
					const $ = cheerio.load(body);
					assert.match($('.form-success').text(), /Settings were saved successfully./);
					return this.helpers.readEnv(config.env.filePath).then(env => {
						const { scrypt } = server.app.custom.lib;
						return scrypt.compare(validFormData.newPassword, env.BLESKOMAT_SERVER_ADMIN_PASSWORD).then(correct => {
							assert.strictEqual(correct, true);
						});
					});
				});
			});
		});

		describe('POST /admin/settings/lightning', function() {

			let validFormData = {
				backend: 'lnd',
				'lnd[baseUrl]': 'https://127.0.0.1:8080',
				'lnd[cert]': '',
				'lnd[macaroon]': '',
			};

			let httpsServer;
			before(function(done) {
				const host = '127.0.0.1';
				const port = 18080;
				const hostname = `${host}:${port}`;
				const macaroon = crypto.randomBytes(64).toString('hex');
				pem.createCertificate({
					selfSigned: true,
					days: 30,
					altNames: [ host ],
				}, (error, result) => {
					if (error) return done(error);
					const key = result.serviceKey;
					const cert = result.certificate;
					httpsServer = https.createServer({ key, cert }, (req, res) => {
						res.end('\n{"payment_error":"no_route"}');
					}).listen(port, host, () => done());
					validFormData['lnd[baseUrl]'] = `https://${hostname}`;
					validFormData['lnd[cert]'] = cert;
					validFormData['lnd[macaroon]'] = macaroon;
				});
			});

			after(function(done) {
				if (httpsServer) return httpsServer.close(done);
				done();
			});

			Object.entries({
				'lnd[baseUrl]': 'Base URL',
				'lnd[cert]': 'TLS Certificate',
				'lnd[macaroon]': 'Macaroon (hex)',
			}).forEach(([key, label], index)  => {
				it(`missing ${key}`, function() {
					let form = JSON.parse(JSON.stringify(validFormData));
					delete form[key];
					return this.helpers.request('post', {
						url: `${config.lnurl.url}/admin/settings/lightning`,
						headers: { cookie },
						form,
					}).then(result => {
						const { response, body } = result;
						assert.strictEqual(response.statusCode, 400);
						const $ = cheerio.load(body);
						assert.ok($('.form-errors').text().indexOf(`"${label}" is required`) !== -1, `Expected error: "${label}" is required`);
					});
				});
			});

			it('valid form inputs', function() {
				return this.helpers.request('post', {
					url: `${config.lnurl.url}/admin/settings/lightning`,
					headers: { cookie },
					form: validFormData,
				}).then(result => {
					const { response, body } = result;
					assert.strictEqual(response.statusCode, 200);
					const $ = cheerio.load(body);
					assert.ok($('.form-success').text().indexOf('Settings were saved successfully.') !== -1);
					return this.helpers.readEnv(config.env.filePath).then(env => {
						const lightning = JSON.parse(env.BLESKOMAT_SERVER_LIGHTNING);
						assert.strictEqual(lightning.backend, validFormData.backend);
						assert.strictEqual(lightning.config.baseUrl, validFormData['lnd[baseUrl]']);
						assert.strictEqual(lightning.config.cert, validFormData['lnd[cert]']);
						assert.strictEqual(lightning.config.macaroon, validFormData['lnd[macaroon]']);
					});
				});
			});
		});
	});
});
