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
var fs = require('./fs');
var event = require('./event');
var service = require('./service');
var Service = require('./service').Service;
var http = require('http');
var zlib = require('zlib');
var crypto = require('crypto');

var g_static_cache = { };

//set util
function setHeader(self, expires) {
	var res = self.response;
	res.setHeader('Server', 'Qgr utils');
	res.setHeader('Date', new Date().toUTCString());
	if (self.request.method == 'GET') {
		expires = expires === undefined ? self.server.expires : expires;
		if (expires) {
			if (!self.m_no_cache/*!res.headers['Cache-Control'] && !res.headers['Expires']*/) {
				// console.log(new Date().addMs(6e4 * expires).toUTCString());
				res.setHeader('Expires', new Date().addMs(6e4 * expires).toUTCString());
				res.setHeader('Cache-Control', 'public, max-age=' + (expires * 60));
			}
		}
	}
	res.setHeader('Access-Control-Allow-Origin', self.server.allowOrigin);
}

function getContentType(self, baseType){
	if(/javascript|text|json|xml/i.test(baseType)){
		return baseType + '; charset=' + self.server.textEncoding;
	}
	return baseType;
}

// 文件是否可支持gzip压缩
function isGzip(self, filename) {
	if(!self.server.gzip){
		return false;
	}
	var ae = self.request.headers['accept-encoding'];
	var type = self.server.getMime(filename);

	return !!(ae && ae.match(/gzip/i) && type.match(self.server.gzip));
}

//返回目录
function _returnDirectory(self, filename) {
	if(self.server.autoIndex) {
		self.returnDirectory(filename);
	} else {
		self.returnStatus(403);
	}
}

//返回目录
function returnDirectory(self, filename) {

	//读取目录
	if (!filename.match(/\/$/))  // 目录不正确,重定向
		return self.redirect(self.pathname + '/');

	var def = self.server.defaults;
	if (!def.length) { //默认页
		return _returnDirectory(self, filename);
	}

	fs.readdir(filename, function (err, files) {
		if (err) {
			console.log(err);
			return self.returnStatus(404);
		}
		for (var i = 0, name; (name = def[i]); i++) {
			if (files.indexOf(name) != -1)
				return self.returnFile(filename.replace(/\/?$/, '/') + name);
		}
		_returnDirectory(self, filename);
	});
}

//返回缓存
function return_cache(self, filename) {

	var cache = g_static_cache[filename];

	if ( cache && cache.data ) {
		var req = self.request;
		var res = self.response;
		var type = self.server.getMime(filename);
		var ims = req.headers['if-modified-since'];
		var mtime = cache.time;

		setHeader(self);

		res.setHeader('Last-Modified', mtime.toUTCString());
		res.setHeader('Content-Type', getContentType(self, type));
		if (cache.gzip) {
			res.setHeader('Content-Encoding', 'gzip');
		}
		res.setHeader('Content-Length', cache.size);
		
		if (ims && Math.abs(new Date(ims) - mtime) < 1000) { //使用 304 缓存
			res.writeHead(304);
			res.end();
		}
		else {
			res.writeHead(200);
			res.end(cache.data);
		}
		return true;
	}
	return false;
}

//返回数据
function result_data(self, filename, type, time, gzip, err, data) {
	
	if (err) {
		delete g_static_cache[filename];
		return self.returnStatus(404);
	}

	var res = self.response;
	var cache = { 
		data: data, 
		time: time, 
		gzip: gzip, 
		size: data.length 
	};
	if ( self.server.fileCacheTime ) { // 创建内存缓存
		g_static_cache[filename] = cache;
		setTimeout(function () { delete cache.data; }, self.server.fileCacheTime * 1e3);
	}
	if (gzip) {
		res.setHeader('Content-Encoding', 'gzip');
	}
	res.setHeader('Content-Length', data.length);
	res.setHeader('Content-Type', getContentType(self, type));
	res.writeHead(200);
	res.end(data);
}

// 返回文件数据范围
function resultFileData(self, filename, type, size, start_range, end_range) {

	var res = self.response;
	var end = false, read = null;
	res.setHeader('Content-Type', getContentType(self, type));

	if (start_range != -1 && end_range != -1) {
		res.setHeader('Content-Length', end_range - start_range);
		res.setHeader('Content-Range', `bytes ${start_range}-${end_range-1}/${size}`);
		res.writeHead(206);
		if (start_range >= end_range) {
			return res.end();
		}
		read = fs.createReadStream(filename, { start: start_range, end: end_range - 1 });
	} else {
		res.setHeader('Content-Length', size);
		res.writeHead(200);
		read = fs.createReadStream(filename);
	}

	read.on('data', function (buff) {
		res.write(buff);
	});
	read.on('end', function () {
		end = true;
		res.end();
	});
	read.on('error', function (e) {
		read.destroy();
		console.error(e);
		end = true;
		res.end();
	});
	res.on('error', function () {
		if(!end){ // 意外断开
			end = true;
			read.destroy();
		}
	});
	res.on('close', function () { // 监控连接是否关闭
		if(!end){ // 意外断开
			end = true;
			read.destroy();
		}
	});
}

//返回异常状态
function resultError(self, statusCode, html) {
	var res = self.response;
	var type = self.server.getMime('html');
	
	setHeader(self);
	res.setHeader('Content-Type', getContentType(self, type));
	res.writeHead(statusCode);
	res.end('<!DOCTYPE html><html><body><h3>' +
		statusCode + ': ' + (http.STATUS_CODES[statusCode] || '') +
		'</h3><br/>' + (html || '') + '</body></html>');
}

/**
 * @class StaticService
 */
var StaticService = util.class('StaticService', Service, {
	// @private:
	m_root: '',

	// @public:
	/**
	 * response of server
	 * @type {http.ServerRequest}
	 */
	response: null,
	
	/**
	 * @type {Object}
	 */
	routerInfo: null,
	
	/**
	 * @constructor
	 * @arg req {http.ServerRequest}
	 * @arg res {http.ServerResponse}
	 * @arg info {Object}
	 */
	constructor: function (req, res, info) {
		Service.call(this, req);
		this.routerInfo = info;
		this.response = res;
		this.m_root = this.server.root; //.substr(0, this.server.root.length - 1);
		// this.setTimeout(this.server.timeout * 1e3);
	},
	
	/** 
	 * @overwrite
	 */
	action: function(info) {
		var method = this.request.method;
		if (method == 'GET' || method == 'HEAD') {
			
			var filename = this.pathname;
			var virtual = this.server.virtual;
			
			if (virtual) { //是否有虚拟目录
				var index = filename.indexOf(virtual + '/');
				if (index === 0) {
					filename = filename.substr(virtual.length);
				} else {
					return this.returnStatus(404);
				}
			}
			if (this.server.disable.test(filename)) {  //禁止访问的路径
				return this.returnStatus(403);
			}
			this.returnFile(this.m_root + filename);
		} else {
			this.returnStatus(405);
		}
	},

	/**
	 * redirect
	 * @param {String} path
	 */
	redirect: function (path) {
		var res = this.response;
		res.setHeader('Location', path);
		res.writeHead(302);
		res.end();
	},
	
	returnStatus: function (statusCode, message) {
		this.returnErrorStatus(statusCode, message);
	},

	/**
	 * return the state to the browser
	 * @param {Number} statusCode
	 * @param {String} text (Optional)  not default status ,return text
	 */
	returnErrorStatus: function(statusCode, html) {
		var self = this;
		var filename = this.server.errorStatus[statusCode];
		
		if (filename) {
			filename = self.m_root + filename;
			fs.stat(filename, function (err) {
				if (err) {
					resultError(self, statusCode, html);
				} else {
					if (util.dev && html) {
						resultError(self, statusCode, html);
					} else {
						self.returnFile(filename);
					}
				}
			});
		} else {
			resultError(self, statusCode, html);
		}
	},
	
	/**
	 * 返回站点文件
	 */
	returnSiteFile: function (name) {
		this.returnFile(this.server.root + '/' + name);
	},

	isAcceptGzip: function(filename) {
		if (!this.server.gzip) {
			return false;
		}
		var ae = this.request.headers['accept-encoding'];

		return !!(ae && ae.match(/gzip/i));
	},

	isGzip(filename) {
		return isGzip(this, filename);
	},
	
	setDefaultHeader: function(expires) {
		setHeader(this, expires);
	},

	setNoCache: function() {
		this.m_no_cache = true;
		this.response.setHeader('Cache-Control', 'no-cache');
		this.response.setHeader('Expires', '-1');
	},
	
	/**
	 * return file to browser
	 * @param {String}       filename
	 */	
	returnFile: function (filename) {
		
		var self = this;
		var req = this.request;
		var res = this.response;
		
		if (!util.dev && return_cache(this, filename)) {  //high speed Cache
			return;
		}
		
		fs.stat(filename, function (err, stat) {
			
			if (err) {
				return self.returnStatus(404);
			}
			
			if (stat.isDirectory()) {  //dir
				return returnDirectory(self, filename);
			}
			
			if (!stat.isFile()) {
				return self.returnStatus(404);
			}
			
			//for file
			if (stat.size > self.server.maxFileSize) { //File size exceeds the limit
				return self.returnStatus(403);
			}
			
			var mtime = stat.mtime;
			var ims = req.headers['if-modified-since'];
			var range = req.headers['range'];
			var type = self.server.getMime(filename);
			var gzip = isGzip(self, filename);
			
			setHeader(self);
			res.setHeader('Last-Modified', mtime.toUTCString());
			res.setHeader('Accept-Ranges', 'bytes');

			if (range) { // return Range
				if (range.substr(0, 6) == 'bytes=') {
					range = range.substr(6).split('-');
					var start_range = range[0] ? Number(range[0]) : 0;
					var end_range = range[1] ? Number(range[1]) : stat.size - 1;
					if (isNaN(start_range) || isNaN(end_range)) {
						return this.returnStatus(400);
					}
					if (!range[0]) { // 选择文件最后100字节  bytes=-100
						start_range = Math.max(0, stat.size - end_range);
						end_range = stat.size - 1;
					}
					end_range++;
					end_range = Math.min(stat.size, end_range);
					start_range = Math.min(start_range, end_range);
					// var ir = req.headers['if-range'];
					// if (ir && Math.abs(new Date(ims) - mtime) < 1000) {
					// }
					return resultFileData(self, filename, type, stat.size, start_range, end_range);
				}
			}

			if (ims && Math.abs(new Date(ims) - mtime) < 1000) { //use 304 cache
				res.setHeader('Content-Type', getContentType(self, type));
				res.writeHead(304);
				res.end();
				return;
			}
			
			if (stat.size > 5 * 1024 * 1024) { // 数据大于5MB使用这个函数处理
				return resultFileData(self, filename, type, stat.size, -1, -1);
			}
			else if ( ! gzip ) { //no use gzip format
				return fs.readFile(filename, function(err, data) {
					result_data(self, filename, type, mtime, false, err, data);
				});
			}
			
			fs.readFile(filename, function(err, data) {
				if (err) {
					console.err(err);
					return self.returnStatus(404);
				}
				zlib.gzip(data, function (err, data) {        		//gzip
					result_data(self, filename, type, mtime, true, err, data);
				});
			});
		});
	},
	
	/**
	 * return dir
	 * @param {String}       filename
	 */
	returnDirectory: function (filename) {
		var self = this;
		var res = this.response;
		var req = this.request;

		//读取目录
		if (!filename.match(/\/$/)){  //目录不正确,重定向
			return self.redirect(self.pathname + '/');
		}

		fs.ls(filename, function (err, files) {
			if (err) {
				return self.returnStatus(404);
			}
			var	dir = filename.replace(self.m_root, '');
			var html =
				'<!DOCTYPE html><html><head><title>Index of {0}</title>'.format(dir) +
				'<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />' +
				'<style type="text/css">*{font-family:Courier New}div,span{line-height:20px;height:20px;}\
				span{display:block;float:right;width:220px}</style>' +
				'</head><body bgcolor="white">' +
				'<h1>Index of {0}</h1><hr/><pre><div><a href="{1}">../</a></div>'.format(dir, dir ? '../' : 'javascript:')

			var ls1 = [];
			var ls2 = [];

			for (var i = 0, stat; (stat = files[i]); i++) {
				var name = stat.name;
				if (name.slice(0, 1) == '.'){
					continue;
				}

				var link = name;
				var size = (stat.size / 1024).toFixed(2) + ' KB';
				var isdir = stat.isDirectory();

				if (isdir) {
					link += '/';
					size = '-';
				}
				
				var s =
					'<div><a href="{0}">{0}</a><span>{2}</span><span>{1}</span></div>'
							.format(link, stat.ctime.toString('yyyy-MM-dd hh:mm:ss'), size);
				isdir ? ls1.push(s) : ls2.push(s);
			}

			html += ls1.join('') + ls2.join('') + '</pre><hr/></body></html>';
			setHeader(self);

			// var type = self.server.getMime('html');
			
			res.writeHead(200);
			res.end(html);
		});
	},
	// @end
});

service.set('StaticService', StaticService);

exports.StaticService = StaticService;
