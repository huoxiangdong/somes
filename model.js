/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2015, xuewen.chu
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of xuewen.chu nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL xuewen.chu BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */

var util = require('./util');

/**
 * @class ModelBasic
 */
class ModelBasic {

	get value() {
		return this.m_value;
	}

	get table() {
		return this.m_table;
	}

	constructor(value = null, {dao,table} = {}) {
		this.m_value = value;
		this.m_dao = dao;
		this.m_table = table;
	}

	toJSON() {
		return this.m_value;
	}

	fetch() {}
	child() {}

}

function value(self, keys) {
	var r = self;
	for (var key of keys) {
		r = r.m_value[key];
		if (!r) return r;
	}
	return r;
}

function parseKeys(mkey) {
	var [key,key2] = mkey.split(',');
	var keys = key.split('.');
	return [
		key2||keys.last(0), keys,
	];
}

/**
 * @class Model
 */
class Model extends ModelBasic {

	async fetch(table, param, { key, select='select', ...opts } = {}) {
		var dao = this.m_dao;
		var [k,keys] = parseKeys(key || dao.$.primaryKey(table));
		var model = await dao[table][select].get({ [k]: value(this,keys), ...param}, opts);
		this.m_value[table] = model;
		return this;
	}

	async fetchChild(table, param, { key, select='select', ...opts } = {}) {
		var dao = this.m_dao;
		var [k,keys] = parseKeys(key || dao.$.primaryKey(this.m_table));
		var collection = await dao[table][select]({ [k]: value(this,keys), limit: 0, ...param}, opts);
		this.m_value[table] = collection;
		return this;
	}

}

/**
 * @class Collection
 */
class Collection extends ModelBasic {

	constructor(value = [], opts = {}) {
		super(value, opts);
		this.m_map = {};
		this.m_ids = [];
		var pk = this.m_dao.$.primaryKey(this.m_table);

		for (var m of this.m_value) {
			var id = m.value[pk];
			if (id) {
				this.m_ids.push(id);
				this.m_map[id] = m;
			}
		}
	}

	get(id) {
		return this.m_map[id];
	}

	get length() {
		return this.m_value.length;
	}

	get ids() {
		return this.m_ids;
	}

	async fetch(table, param, { key, select='select', ...opts } = {}) {
		var dao = this.m_dao;
		var pk0 = dao.$.primaryKey(table);
		var [k,keys] = parseKeys(key || pk0);
		var ids = this.m_value.map(e=>value(e,keys)).filter(e=>e);

		if (ids.length) {
			var collection = await dao[table][select]({ [k]:ids, limit: 0, ...param}, opts);
			var map = collection.m_map;
			if (k != pk0) {
				map = {};
				for (var m of collection.m_value) {
					var id = m.m_value[k];
					if (id) {
						map[id] = m;
					}
				}
			}
			this.m_value.forEach(e=>{
				e.m_value[table] = map[value(e, keys)] || null;
			});
		}
		return this;
	}

	async fetchChild(table, param, { key, select='select', ...opts } = {}) {
		var dao = this.m_dao;
		var pk0 = dao.$.primaryKey(this.m_table);
		var [k,keys] = parseKeys(key || pk0);
		var ids = this.m_value.map(e=>value(e,keys)).filter(e=>e);

		if (ids.length) {
			var collection = await dao[table][select]({ [k]:ids, limit: 0, ...param}, opts);
			var map = {};
			for (var m of collection.m_value) {
				var id = m.m_value[k];
				if (id) {
					var ls = map[id];
					if (ls) {
						ls = ls.m_value;
					} else {
						ls = [];
						map[id] = new Collection(ls,{table,dao});
					}
					ls.push(m);
				}
			}
			this.m_value.forEach(e=>{
				e.m_value[table] = map[value(e, keys)] || [];
			});
		}
		return this;
	}

}


module.exports = {
	Model,
	Collection,
};