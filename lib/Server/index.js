/*
	Copyright (C) 2020 Samotari (Charles Hill, Carlos Garcia Ortiz)

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

const _ = require('underscore');
const assert = require('assert');
const coinRates = require('coin-rates');
const debug = {
	error: require('debug')('bleskomat-server:error'),
	info: require('debug')('bleskomat-server:info'),
};
const fs = require('fs');
const lnurl = require('lnurl');
const { HttpError } = require('lnurl/lib');
const path = require('path');
const pkg = require('../../package.json');
const toMilliSatoshis = require('../toMilliSatoshis');

module.exports = function(config) {

	if (config.env.filePath) {
		// Sanity checks for .env file.
		config.env.filePath = path.resolve(config.env.filePath);
		(function() {
			const { filePath } = config.env;
			const dir = path.dirname(filePath);
			fs.statSync(dir);
			try {
				fs.appendFileSync(filePath, '');
			} catch (error) {
				if (/EACCES: permission denied, open/i.test(error.message)) {
					throw error;
				}
			}
		})();
	}

	if (config.admin.web) {
		// Web-based admin interface enabled.
		// Do configuration checks before initializing the server.
		assert.ok(config.admin.scrypt, 'Missing required config: "admin.scrypt"');
		assert.strictEqual(typeof config.admin.scrypt, 'object', 'Invalid config ("admin.scrypt"): Object expected');
		assert.ok(config.admin.scrypt.keylen, 'Missing required config: "admin.scrypt.keylen"');
		assert.ok(config.admin.scrypt.saltBytes, 'Missing required config: "admin.scrypt.saltBytes"');
		if (config.admin.passwordPlaintext) {
			// Ignore plaintext password if a hashed password is already provided.
			if (!config.admin.password) {
				config.admin.password = (function() {
					const scrypt = require('./admin/lib/scrypt');
					const { keylen, saltBytes, options } = config.admin.scrypt;
					const secret = config.admin.passwordPlaintext;
					const salt = scrypt.generateSalt(saltBytes);
					return scrypt.hashSync(secret, salt, keylen, options);
				})();
			}
			config.admin.passwordPlaintext = null;
			process.env.BLESKOMAT_SERVER_ADMIN_PASSWORD_PLAINTEXT = null;
		}
		assert.ok(config.admin.password || !config.lnurl.lightning || config.lnurl.lightning.backend === 'dummy', 'A password is required to use the admin interface with a configured Lightning backend');
		assert.ok(config.admin.session, 'Missing required config: "admin.session"');
		assert.strictEqual(typeof config.admin.session, 'object', 'Invalid config ("admin.session"): Object expected');
		if (!config.admin.session.secret) {
			config.admin.session.secret = require('crypto').randomBytes(32).toString('hex');
		}
	}

	const server = lnurl.createServer(config.lnurl);
	const { app } = server;

	app.custom = {
		config,
		debug,
		lib: {},
		lnurlServer: server,
		version: pkg.version,
	};

	server.bindToHook('url:signed', function(req, res, next) {
		return Promise.resolve().then(() => {
			const { id, signature, tag } = req.query;
			if (!id || !signature) {
				// Not a signed LNURL. Do nothing here.
				return;
			}
			assert.strictEqual(tag, 'withdrawRequest', new HttpError(`Unsupported tag: "${tag}"`, 400));
			const fiatCurrency = req.query.f || req.query.fiatCurrency;
			assert.ok(fiatCurrency, new HttpError('Missing required fiat currency symbol: "f" or "fiatCurrency"', 400));
			assert.strictEqual(req.query.minWithdrawable, req.query.maxWithdrawable, new HttpError('min/maxWithdrawable must be equal', 400));
			return server.getApiKey(id).then(apiKey => {
				const { exchangeRatesProvider, enabled } = apiKey;
				assert.ok(enabled, new HttpError(`API key disabled: ID = "${id}"`, 400));
				// Amounts are denominated in fiat currency.
				// Get the current exchange rate so that the amounts can be converted to sats.
				return server.getExchangeRate({
					currencies: {
						from: 'BTC',
						to: fiatCurrency,
					},
					provider: exchangeRatesProvider,
				}).then(rate => {
					const { tag } = req.query;
					switch (tag) {
						case 'withdrawRequest':
							// Override the query object with the amounts in msats.
							req.query.minWithdrawable = req.query.maxWithdrawable = toMilliSatoshis(req.query.minWithdrawable, rate);
							break;
					}
				});
			});
		}).then(() => {
			next();
		}).catch(next);
	});

	const getApiKey = server.getApiKey.bind(server);
	server.getApiKey = function(id) {
		return getApiKey(id).then(apiKey => {
			if (apiKey) {
				apiKey = _.defaults(apiKey, {
					enabled: true,
				});
			}
			return apiKey;
		});
	};

	server.getExchangeRate = function(options) {
		options = _.defaults(options || {}, config.coinRates.defaults);
		return coinRates.get(options);
	};

	if (config.admin.web) {
		// Web-based admin interface enabled.
		require('./admin')(app);
	}

	if (config.lnurlpos.enabled) {
		// LNURLPoS web API is enabled.
		require('./lnurlpos')(app);
	}

	return server;
};
