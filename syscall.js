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
var child_process = require('child_process');
var { moreLog } = util.config;

function syscall(cmd) {
	var ch = child_process.spawnSync('sh', ['-c', cmd]);
	if (ch.status != 0) {
		if (ch.stderr.length) {
			console.error(ch.stderr.toString('utf8'));
		}
		if (ch.stdout.length) {
			console.log(ch.stdout.toString('utf8'));
		}
		console.log('status != 0 exit process')
		process.exit(ch.status);
	} else {
		return {
			code: ch.status,
			stdout: ch.stdout.length ? ch.stdout.toString().split('\n'): [],
			stderr: ch.stderr.length ? ch.stderr.toString().split('\n'): [],
		};
	}
}

function execSync(cmd) {
	return spawnSync('sh', ['-c', cmd]);
}

function exec(cmd) {
	return spawn('sh', ['-c', cmd]);
}

function spawnSync(cmd, args = []) {
	// var ls = cmd.split(/\s+/);
	// var ch = child_process.spawnSync(ls.shift(), ls);
	var ch = child_process.spawnSync(cmd, args);
	if (ch.error) {
		throw ch.error;
	} else {
		return {
			code: ch.status,
			stdout: ch.stdout.length ? ch.stdout.toString().split('\n'): [],
			stderr: ch.stderr.length ? ch.stderr.toString().split('\n'): [],
		};
	}
}

function on_data(e, ch) {
	var log = e.toString('utf8');
	if (moreLog) 
		console.log(log);
	return log;
}

function on_error(e, ch) {
	var log = e.toString('utf8');
	if (moreLog) 
		console.error(log);
	return log;
}

function spawn(cmd, args = [], onData = on_data, onError = on_error) {
	// var ls = cmd.split(/\s+/);
	// var ch = child_process.spawn(ls.shift(), ls);
	var ch = child_process.spawn(cmd, args);
	var error;
	var stdout = [];
	var stderr = [];
	var _resolve, _reject;
	var completed = false, data, err;

	var resolve = function(e) {
		completed = true;
		data = e;
	};

	var reject = function(e) {
		completed = true;
		err = e;
	};

	ch.on('error', function(err) {
		error = Error.new(err);
		reject(error);
	});

	ch.stdout.on('data', function(e) {
		var log = onData(e, ch);
		if (log) {
			stdout.push(...log.split('\n'));
		}
	});

	ch.stderr.on('error', function(e) {
		var log = onError(e, ch);
		if (log) {
			stderr.push(...log.split('\n'));
		}
	});

	ch.on('exit', function(code) {
		if (!error) {
			resolve({ code, stdout, stderr });
		}
	});

	var p = new Promise((_resolve, _reject)=>{
		if (completed) {
			if (err) {
				_reject(err);
			} else {
				_resolve(data);
			}
		} else {
			resolve = _resolve;
			reject = _reject;
		}
	});

	p.process = ch;

	return p;
}

exports.syscall = syscall;
exports.execSync = execSync;
exports.spawnSync = spawnSync;
exports.exec = exec;
exports.spawn = spawn;

