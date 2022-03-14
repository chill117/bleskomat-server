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
const BigNumber = require('bignumber.js');
const coinRates = require('coin-rates');
const Form = require('@bleskomat/form');
const { generateApiKey, HttpError } = require('lnurl/lib');
const { ValidationError } = Form;

module.exports = function(app) {

	const { config, lib, middleware } = app.custom;
	const { env } = lib;

	const title = 'Create New API Key';
	const form = new Form({
		method: 'post',
		action: '/admin/api-keys/create',
		submit: 'Create',
		instructions: 'Use the form below to create a new API key',
		groups: [
			{
				name: 'apiKey',
				inputs: [
					{
						name: 'encoding',
						label: 'API Key Encoding',
						type: 'select',
						help: 'Legacy LNURLPoS device firmware requires utf-8. Most other devices use hexadecimal.',
						default: 'hex',
						options: [
							{ key: 'hex', label: 'hexadecimal' },
							{ key: 'utf8', label: 'utf-8' },
						],
						required: true,
					},
				],
			},
			{
				name: 'options',
				inputs: [
					{
						name: 'enabled',
						label: 'Enabled',
						type: 'checkbox',
						default: true,
					},
					{
						name: 'fiatCurrency',
						label: 'Fiat Currency',
						type: 'text',
						default: 'EUR',
						required: true,
					},
					{
						name: 'exchangeRatesProvider',
						label: 'Exchange Rates Provider',
						type: 'select',
						options: function() {
							return _.chain(coinRates.providers).pluck('name').map(function(name) {
								return {
									key: name,
									label: name,
								};
							}).value();
						},
						validate: function(value, data) {
							const { fiatCurrency } = data;
							return coinRates.get({
								currencies: {
									from: 'BTC',
									to: fiatCurrency,
								},
								provider: value,
							}).catch(error => {
								debug.error(error);
								throw new ValidationError(`Fiat currency ("${fiatCurrency}") not supported by the selected provider ("${value}")`);
							});
						},
						default: 'kraken',
						required: true,
					},
					{
						name: 'feePercent',
						label: 'Fee Percent (%)',
						type: 'text',
						default: '0.00',
						validate: function(value) {
							let number;
							assert.doesNotThrow(() => number = new BigNumber(value), new ValidationError('Fee Percent (%) must be a number'));
							assert.ok(!number.isNaN(), new ValidationError('Fee Percent (%) must be a number'));
						},
						required: true,
					},
				],
			},
		],
	});

	app.get('/admin/api-keys/create',
		function(req, res, next) {
			res.render('form', {
				form,
				title,
			});
		}
	);

	app.post('/admin/api-keys/create',
		middleware.bodyParser,
		function(req, res, next) {
			return form.validate(req.body).then(values => {
				const { encoding } = values;
				const apiKey = generateApiKey({
					encoding: 'hex',
					numBytes: { id: 10, key: 32 },
				});
				_.extend(apiKey, _.pick(values, 'enabled', 'encoding', 'exchangeRatesProvider', 'feePercent', 'fiatCurrency'));
				config.lnurl.auth.apiKeys.push(apiKey);
				return env.save(config).then(() => {
					return res.redirect('/admin/overview');
				});
			}).catch(error => {
				if (error instanceof ValidationError) {
					error = new HttpError(error.message, 400);
				}
				if (error instanceof HttpError) {
					return res.status(error.status).render('form', {
						form: form.serialize({
							extend: { errors: [ error.message ] },
							values: req.body,
						}),
						title,
					});
				}
				next(error);
			});
		}
	);
};
