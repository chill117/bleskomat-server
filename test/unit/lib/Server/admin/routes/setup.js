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

describe('admin', function() {

	let config, server;
	before(function() {
		config = this.helpers.prepareConfig();
		config.admin.web = true;
		config.admin.password = '';
		return this.helpers.createServer(config).then(result => {
			server = result;
		});
	});

	after(function() {
		if (server) return server.close({ force: true }).then(() => {
			server = null;
		});
	});

	it('GET /admin/setup', function() {
		return this.helpers.request('get', {
			url: `${config.lnurl.url}/admin/setup`,
		}).then(result => {
			const { response, body } = result;
			assert.strictEqual(response.statusCode, 200);
			const $ = cheerio.load(body);
			assert.match($('h1').text(), /Admin Interface Setup/);
			assert.match($('.form-group--login .form-group-instructions').text(), /Set an administrator password/);
			assert.strictEqual($('form input[name=password]').length, 1);
			assert.strictEqual($('form input[name=verifyPassword]').length, 1);
		});
	});

	describe('POST /admin/setup', function() {

		const validFormData = {
			password: 'test',
			verifyPassword: 'test',
		};

		Object.entries({
			password: 'Password',
			verifyPassword: 'Verify Password',
		}).forEach(([key, label], index) => {
			it(`missing ${label}`, function() {
				let form = JSON.parse(JSON.stringify(validFormData));
				delete form[key];
				return this.helpers.request('post', {
					url: `${config.lnurl.url}/admin/setup`,
					form,
				}).then(result => {
					const { response, body } = result;
					assert.strictEqual(response.statusCode, 400);
					const $ = cheerio.load(body);
					assert.match($('.form-errors').text(), new RegExp(`"${label}" is required`));
				});
			});
		});

		it('passwords do not match', function() {
			return this.helpers.request('post', {
				url: `${config.lnurl.url}/admin/setup`,
				form: {
					password: validFormData.password,
					verifyPassword: `x${validFormData.password}`,
				},
			}).then(result => {
				const { response, body } = result;
				assert.strictEqual(response.statusCode, 400);
				const $ = cheerio.load(body);
				assert.match($('.form-errors').text(), /"Verify Password" must match "Password"/);
			});
		});

		it('valid form data', function() {
			return this.helpers.request('post', {
				url: `${config.lnurl.url}/admin/setup`,
				form: validFormData,
			}).then(result => {
				const { response, body } = result;
				assert.strictEqual(response.statusCode, 302);
				assert.strictEqual(body, 'Found. Redirecting to /admin');
				return this.helpers.readEnv(config.env.filePath).then(env => {
					const { scrypt } = server.app.custom.lib;
					return scrypt.compare(validFormData.password, env.BLESKOMAT_SERVER_ADMIN_PASSWORD).then(correct => {
						assert.strictEqual(correct, true);
					});
				});
			});
		});
	});
});
