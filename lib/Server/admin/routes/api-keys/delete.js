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

module.exports = function(app) {

	const { config, lib } = app.custom;
	const { env } = lib;

	app.get('/admin/api-keys/:id/delete',
		function(req, res, next) {
			const { id } = req.params;
			config.lnurl.auth.apiKeys = _.filter(config.lnurl.auth.apiKeys, apiKey => {
				return apiKey.id !== id;
			});
			return env.save(config).then(() => {
				return res.redirect('/admin/overview');
			});
		}
	);
};