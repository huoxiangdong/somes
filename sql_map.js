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
var path = require('path');
var xml = require('./xml');
var {Mysql} = require('./mysql');
var db = require('./db');
var memcached = require('./memcached');
var fs = require('./fs');

var cache = {};
var original_handles = {};
var original_files = {};
var REG = /\{(.+?)\}/g;

/**
 * @createTime 2012-01-18
 * @author xuewen.chu <louis.tru@gmail.com>
 */
var private$transaction = util.class('private$transaction', {

	/**
	 * @field map {SqlMap}
	 */
	map: null,
	
	/**
	 * @field {Database} database
	 */
	db: null,

	/**
	 * @constructor
	 */
	constructor: function(sql_map) {
		this.map = sql_map;
		this.db = get_db(sql_map);
		this.db.transaction(); // start transaction
	},

	/**
	 * get data
	 */
	get2: function(name, param, cb) {
		return funcs.get2(this.map, name, param, cb, this.db);
	},
	
	/**
	 * @func get(name, param)
	 */
	get: function(name, param) {
		return funcs.get(this.map, name, param, this.db);
	},
	
	/**
	 * get data list
	 */
	gets2: function(name, param, cb) {
		return funcs.gets2(this.map, name, param, cb, this.db);
	},

	/**
	 * @func gets(name, param)
	 */
	gets: function(name, param) {
		return funcs.gets(this.map, name, param, this.db);
	},
	
	/**
	 * post data
	 */
	post2: function(name, param, cb) {
		return funcs.post2(this.map, name, param, cb, this.db);
	},

	/**
	 * @func post(name, param)
	 */
	post: function(name, param) {
		return funcs.post(this.map, name, param, this.db);
	},

	/**
	 * @func query2(name, param, cb)
	 */
	query2: function(name, param, cb) {
		return funcs.query2(this.map, name, param, cb, this.db);
	},

	/**
	 * @func query(name, param, cb)
	 */
	query: function(name, param) {
		return funcs.query(this.map, name, param, this.db);
	},
	
	/**
	 * commit transaction
	 */
	commit: function() {
		this.db.commit();
		this.db.close();
	},
	
	/**
	 * rollback transaction
	 */
	rollback: function() {
		this.db.rollback();
		this.db.close();
	},
	
});

function read_original_handles(self, original_path) {

	var doc = new xml.Document();
	doc.load(fs.readFileSync(original_path + '.xml').toString('utf8'));
	var ns = doc.getElementsByTagName('map');

	if (!ns.length) {
		throw new Error(name + ' : not map the root element');
	}
	ns = ns.item(0).childNodes;

	for (var i = 0; i < ns.length; i++) {
		var node = ns.item(i);
		if (node.nodeType === xml.ELEMENT_NODE) {
			original_handles[original_path + '/' + node.tagName] = parseMapEl(self, node);
		}
	}
	original_files[original_path] = fs.statSync(original_path + '.xml').mtime;
}

function get_original_handle(self, name) {
	var handle = self.m_original_handles[name];
	if (handle && !util.dev) {
		return handle;
	}

	var handle_name = path.basename(name);
	var original_path = path.resolve(self.original, path.dirname(name));

	if (original_path in original_files) {
		if (util.dev) {
			if (fs.statSync(original_path + '.xml').mtime != original_files[original_path]) {
				read_original_handles(self, original_path);
			}
		}
	} else {
		read_original_handles(self, original_path);
	}

	self.m_original_handles[name] = handle = original_handles[original_path + '/' + handle_name];
	if (!handle) {
		throw new Error(name + ' : can not find the map');	
	}
	return handle;
}

//get db
function get_db(self) {
	var db = self.db;
	var db_class = null;
	
	switch (self.type) {
		case 'mysql' : db_class = Mysql; break;
		case 'mssql' : 
		case 'oracle': 
		default:
			break;
	}
	
	util.assert(db_class, 'Not supporting database, {0}', self.type);
	
	return new db_class(db);
}

/**
 * @createTime 2012-01-18
 * @author xuewen.chu <louis.tru@gmail.com>
 */
function parseMapEl(self, el) {
	var ls = [];
	var obj = { __t__: el.tagName, __ls__: ls };
	var ns = el.attributes;

	for (var i = 0, l = ns.length; i < l; i++) {
		var n = ns.item(i);
		obj[n.name] = n.value;
	}

	ns = el.childNodes;
	for ( i = 0; i < ns.length; i++ ) {
		var node = ns.item(i);
		
		switch (node.nodeType) {
			case xml.ELEMENT_NODE:
				ls.push(parseMapEl(self, node));
				break;
			case xml.TEXT_NODE:
			case xml.CDATA_SECTION_NODE:
				ls.push(node.nodeValue);
				break;
		}
	}
	return obj;
}

//compilation sql
function compilation(self, exp, param) {

	var variable = {};

	exp = exp.replace(REG, function (all, name) {
		variable[name] = param[name];
		return name;
	});

	var code = ['(function (){'];

	for (var i in variable) {
		var item = variable[i];
		var value =
			item instanceof Date ? 'new Date({0})'.format(item.valueOf()) :
			JSON.stringify(item);
		code.push('var {0} = {1};'.format(i, value));
	}

	code.push('return !!(' + exp + ')');
	code.push('}())');
	return util._eval(code.join(''));
}

//format sql
function format(self, sql, param) {
	return sql.replace(REG, function (all, name) {
		return db.escape(param[name]);
	});
}

//join map
function joinMap(self, item, param) {

	var name = item.name;
	var value = param[name];

	if (!value) {
		return '';
	}
	var ls = Array.toArray(value);
	
	for (var i = 0, l = ls.length; i < l; i++) {
		ls[i] = db.escape(ls[i]);
	}
	return ls.join(item.value || '');
}

//if map
function ifMap(self, item, param) {

	var exp = item.exp;
	var name = item.name;
	var prepend = item.prepend;

	if (exp) {
		if (!compilation(self, exp, param)) {
			return null;
		}
	}
	else if (name && !(name in param)) {
		return null;
	}

	var sql = lsMap(self, item.__ls__, param);

	return { prepend: prepend, sql: sql };
}

//ls map
function lsMap(self, ls, param) {

	var result = [];
	for (var i = 0, l = ls.length; i < l; i++) {
		var item = ls[i];
		var type = item.__t__;

		if (typeof item == 'string') {
			item = format(self, item, param).trim();
			if (item) {
				result.push(' ' + item);
			}
			continue;
		}

		if (type == 'if') {
			item = ifMap(self, item, param);
			if (item && item.sql) {
				var prepend = result.length ? (item.prepend || '') + ' ' : '';

				result.push(' ' + prepend + item.sql);
			}
		}
		else if (type == 'join') {
			result.push(joinMap(self, item, param));
		}
	}
	return result.join(' ');
}

//get map object
function getMap(self, name, param) {
	var map = get_original_handle(self, name);
	var i = ifMap(self, map, param);

	map.sql = i ? '{0} {1}'.format(i.prepend || '', i.sql) : '';
	return map;
}

// del cache
//
// Special attention,
// taking into account the automatic javascript resource management,
// where there is no "This", more conducive to the release of resources
//
function delCache(key) {
	delete cache[key];
}

function noop(err) {
	if (err) throw err;
}

function select_cb(param, cb) {
	return (typeof param == 'function') ? param : (typeof cb != 'function' ? noop : cb);
}

//query
function query(self, type, name, param, cb, transaction_db) {
	param = { ...param };
	var db = null;
	
	try {
		db = transaction_db || get_db(self);
		var map = getMap(self, name, param);
		var cacheTime = parseInt(map.cache) || 0;
		var sql = map.sql;
		
		function handle(err, data) {
			if (!transaction_db) { 
				// Non transaction, shut down immediately after the query
				db.close();
			}
			if (err) {
				cb(err);
			} else {
				if (type == 'get' && cacheTime) {
					if (self.memcached) {
						memcached.shared.set(key, data, cacheTime);
					}
					else {
						cache[key] = data;
						delCache.setTimeout(cacheTime * 1e3, key);
					}
				}
				cb(null, data);
			}
		}
		if (type == 'get') { // use cache
			var key = util.hash(sql);
			if (self.memcached) {
				memcached.shared.get(key, function (err, data) {
					if (err) {
						console.err(err);
					}
					if (data) {
						cb(err, data);
					} else {
						db.query(sql, handle);
					}
				});
			} else {
				var data = cache[key];
				if (data) {
					cb(null, data);
				} else {
					db.query(sql, handle);
				}
			}
		} else {
			db.query(sql, handle);
		}
	} catch (err) {
		if (db) {
			db.close();
		}
		cb(err);
	}
}

var funcs = {

	/**
	 * get data
	 */
	get2: function(map, name, param, cb, db) {
		cb = select_cb(param, cb);
		query(map, 'get', name, param, function (err, data) {
			if (err) {
				cb(err);
			} else {
				var [{rows}] = data;
				cb(null, rows ? (rows[0] || null) : null);
			}
		}, db);
	},
	
	/**
	 * @func get(name, param)
	 */
	get: function(map, name, param, db) {
		return new Promise((resolve, reject)=> {
			query(map, 'get', name, param, function(err, data) {
				if (err) {
					reject(err);
				} else {
					var [{rows}] = data;
					resolve(rows ? (rows[0] || null) : null);
				}
			}, db);
		});
	},
	
	/**
	 * get data list
	 */
	gets2: function(map, name, param, cb, db) {
		cb = select_cb(param, cb);
		query(map, 'get', name, param, function(err, data) {
			if (err) {
				cb(err);
			} else {
				var [{rows}] = data;
				cb(null, rows || null);
			}
		}, db);
	},

	/**
	 * @func gets(name, param)
	 */
	gets: function(map, name, param, db) {
		return new Promise((resolve, reject)=> {
			query(map, 'get', name, param, function(err, data) {
				if (err) {
					reject(err);
				} else {
					var [{rows}] = data;
					resolve(rows || null);
				}
			}, db);
		});
	},
	
	/**
	 * post data
	 */
	post2: function(map, name, param, cb, db) {
		cb = select_cb(param, cb);
		query(map, 'post', name, param, function(err, data) {
			if (err) {
				cb(err);
			} else {
				cb(null, data[0]);
			}
		}, db);
	},
	
	/**
	 * @func post(name, param)
	 */
	post: function(map, name, param, db) {
		return new Promise((resolve, reject)=> {
			query(map, 'post', name, param, function(err, data) {
				if (err) {
					reject(err);
				} else {
					resolve(data[0]);
				}
			}, db);
		});
	},
	
	/**
	 * @func query2(name, param, cb)
	 */
	query2: function(map, name, param, cb, db) {
		cb = select_cb(param, cb);
		query(map, 'query', name, param, cb, db);
	},
	
	/**
	 * @func query(name, param, cb)
	 */
	query: function(map, name, param, cb, db) {
		return new Promise((resolve, reject)=> {
			query(map, 'query', name, param, function(err, data) {
				if (err) {
					reject(err);
				} else {
					resolve(data);
				}
			}, db);
		});
	},

};

var SqlMap = util.class('SqlMap', {

	//private:
	m_original_handles: null,

	//public:
	/**
	 * @field {String} database type
	 */
	type: 'mysql',
	
	/**
	 * @field {Boolean} is use memcached
	 */
	memcached: false,
	
	/**
	 * 
	 * @field {Object} db config info
	 */
	db: null,

	/**
	 * original xml base path
	 * @type {String}
	 */
	original: '',
	
	/**
	 * @constructor
	 * @arg [conf] {Object} Do not pass use center server config
	 */ 
	constructor: function(conf) {
		this.m_original_handles = {};
		if (conf) {
			util.update(this, conf);
			this.db = {
				port: 3306,
				host: 'localhost',
				user: 'root',
				password: '',
				database: '',
				...this.db,
			};
		} else {
			// use center server config
			// on event
			throw new Error('use center server config');
		}
	},
	
	
	/**
	 * get data
	 */
	get2: function(name, param, cb) {
		return funcs.get2(this, name, param, cb);
	},
	
	/**
	 * @func get(name, param)
	 */
	get: function(name, param) {
		return funcs.get(this, name, param);
	},
	
	/**
	 * get data list
	 */
	gets2: function(name, param, cb) {
		return funcs.gets2(this, name, param, cb);
	},

	/**
	 * @func gets(name, param)
	 */
	gets: function(name, param) {
		return funcs.gets(this, name, param);
	},
	
	/**
	 * post2 data
	 */
	post2: function(name, param, cb) {
		return funcs.post2(this, name, param, cb);
	},

	/**
	 * @func post(name, param)
	 */
	post: function(name, param) {
		return funcs.post(this, name, param);
	},

	/**
	 * @func query2(name, param, cb)
	 */
	query2: function(name, param, cb) {
		return funcs.query2(this, name, param, cb);
	},

	/**
	 * @func query(name, param, cb)
	 */
	query: function(name, param) {
		return funcs.query(this, name, param);
	},
	
	/**
		* start transaction
		* @return {private$transaction}
		*/
	transaction: function() {
		return new private$transaction(this);
	},
	
});

var shared = null;

module.exports = {

	SqlMap: SqlMap,

	/**
	 * @func setShared
	 */
	setShared: function(sqlmap) {
		shared = sqlmap;
	},
	
	/**
		* get default dao
		* @return {SqlMap}
		* @static
		*/
	get shared() {
		return shared;
	},
};
