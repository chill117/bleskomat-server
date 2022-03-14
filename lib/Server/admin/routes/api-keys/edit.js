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
const { HttpError } = require('lnurl/lib');
const { ValidationError } = Form;

module.exports = function(app) {

	const { config, lib, middleware } = app.custom;
	const { env } = lib;

	const title = 'Edit API Key';

	const form = new Form({
		method: 'post',
		submit: 'Save',
		groups: [
			{
				name: 'apiKey',
				inputs: [
					{
						name: 'id',
						label: 'API Key ID',
						readonly: true,
						required: true,
					},
					{
						name: 'encoding',
						label: 'Encoding',
						readonly: true,
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

	app.get('/admin/api-keys/:id/edit',
		function(req, res, next) {
			const { id } = req.params;
			const apiKey = _.findWhere(config.lnurl.auth.apiKeys, { id });
			assert.ok(apiKey, new HttpError(`API key does not eixst: ID = ${id}`, 400));
			return res.render('form', {
				form: form.serialize({
					extend: {
						success: !_.isUndefined(req.query.success) ? 'Changes saved successfully.' : '',
					},
					values: apiKey,
				}),
				title,
			});
		}
	);

	app.post('/admin/api-keys/:id/edit',
		middleware.bodyParser,
		function(req, res, next) {
			return form.validate(req.body).then(values => {
				const { id } = values;
				assert.ok(_.findWhere(config.lnurl.auth.apiKeys, { id }), new HttpError(`API key does not eixst: ID = ${id}`, 400));
				const index = _.findIndex(config.lnurl.auth.apiKeys, apiKey => {
					return apiKey.id === id;
				});
				_.extend(config.lnurl.auth.apiKeys[index], _.pick(values, 'enabled', 'exchangeRatesProvider', 'feePercent', 'fiatCurrency'));
				return env.save(config).then(() => {
					return res.redirect(`/admin/api-keys/${id}/edit?success`);
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
