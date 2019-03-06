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

var utils = require('./util');
var path = require('./path');
var { Notification } = require('./event');
var { log, error, dir, warn } = console;
var { haveNode, haveQgr, haveWeb } = utils;

if (haveQgr) {
	var fs = requireNative('_fs');
} else if (haveNode) {
	var fs = require('./fs');
}

function print(self, TAG, func, ...args) {
	args.unshift(new Date().toString('yyyy-MM-dd hh:mm:ss.fff'));
	args.unshift(TAG);
	args = args.map(e=>{
		try {
			return typeof e == 'object' ? JSON.stringify(e, null, 2): e;
		} catch(e) {
			return e;
		}
	});
	func.call(console, ...args);
	var data = args.join(' ');
	if (self.m_fd) {
		fs.write(self.m_fd, data + '\n', 'utf-8', function() {});
	}
	self.trigger('Log', { tag: TAG, data: data });
	return data;
}

function formatTime(time) {
	return time.toString('yyyy-MM-dd hh:mm:ss.fff');
}

function timeSpace(self) {
	return new Array(self.m_timeStack.length).join('  ');
}

var default_console = null;

class Console extends Notification {

	constructor(pathname) {
		super();
		if (pathname) {
			if (!haveWeb) {
				fs.mkdirpSync(path.dirname(pathname));
				this.m_fd = fs.openSync(pathname, 'a');
			} else {
				this.m_fd = 0;
			}
			this.m_pathname = pathname;
		} else {
			this.m_fd = 0;
			this.m_pathname = '';
		}
		this.m_timeStack = [];
	}

	get fd() {
		this.m_fd;
	}

	get pathname() {
		this.m_pathname;
	}
	
	makeDefault() {
		console.log = this.log.bind(this);
		console.error = this.error.bind(this);
		console.dir = this.dir.bind(this);
		console.warn = this.warn.bind(this);
		console.dlog = this.dlog.bind(this);
		console.time = this.time.bind(this);
		console.timeline = this.timeline.bind(this);
		console.timeEnd = this.timeEnd.bind(this);
		this._log = log;
		this._error = error;
		this._dir = dir;
		this._warn = warn;
		default_console = this;
		return this;
	}
	
	log(...args) {
		return print(this, 'LOG', log, ...args);
	}

	warn(...args) {
		return print(this, 'WARN', warn, ...args);
	}

	error(...args) {
		return print(this, 'ERR', error, ...args);
	}

	dir(...args) {
		return print(this, 'DIR', dir, ...args);
	}

	dlog(...args) {
		if (utils.dev || utils.config.moreLog) {
			print(this, 'LOG', log, ...args);
		}
	}

	time(tag = '') {
		var date = new Date();
		var time = { date: date, tag, timelines: [{ date: date, tag }] };
		this.m_timeStack.push(time);
		this.dlog(timeSpace(this), 'Time    ', formatTime(time.date), tag);
	}

	timeline(tag = '') {
		if (!this.m_timeStack.length) return;
		// utils.assert(this.m_timeStack.length);
		var time = this.m_timeStack.last(0);
		var privline = time.timelines.last(0);
		var line = { tag, date: new Date() };
		time.timelines.push(line);
		this.dlog(timeSpace(this), 'TimeLine', 
			formatTime(line.date), line.date - privline.date, tag);
	}

	timeEnd(tag = '') {
		if (!this.m_timeStack.length) return;
		this.timeline(tag);
		var { tag: tag2, timelines } = this.m_timeStack.last(0);
		this.dlog(timeSpace(this), 'TimeEnd ', tag2, '--------------');
		timelines.forEach((e, j)=>{
			if (j == 0) {
				this.dlog(timeSpace(this), '---->   ', 
					formatTime(e.date), e.tag);
			} else {
				this.dlog(timeSpace(this), '---->   ', 
					formatTime(e.date), e.date - timelines[j-1].date, e.tag);
			}
		});
		this.dlog(timeSpace(this), 'TimeEnd ', tag2, 
			timelines.last(0).date - timelines[0].date, '--------------');
		this.m_timeStack.pop();
	}

}

exports = module.exports = {

	Console: Console,

	log: (...args)=>{
		exports.defaultConsole.log(...args);
	},

	warn: (...args)=>{
		exports.defaultConsole.warn(...args);
	},

	error: (...args)=>{
		exports.defaultConsole.error(...args);
	},

	dir: (...args)=>{
		exports.defaultConsole.dir(...args);
	},

	dlog: (...args)=>{
		exports.defaultConsole.dlog(...args);
	},

	time: (...args)=>{
		exports.defaultConsole.time(...args);
	},

	timeline: (...args)=>{
		exports.defaultConsole.timeline(...args);
	},

	timeEnd: (...args)=>{
		exports.defaultConsole.timeEnd(...args);
	},

	get defaultConsole() {
		if (!default_console) {
			default_console = new Console();
		}
		return default_console;
	},

}