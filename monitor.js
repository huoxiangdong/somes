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
var errno = require('./errno');

function clear(self) {
	clearTimeout(self.m_timeout_id);
	self.m_running_id = 0;
	self.m_timeout_id = 0;
	self.m_run_loop = null;
}

class Monitor {

	get interval() { return this.m_interval }
	set interval(val) { this.m_interval = val }
	get maxDuration() { return this.m_maxDuration }
	set maxDuration(val) { this.m_maxDuration = val }	

	constructor(interval = 1e3, maxDuration = -1) {
		this.m_interval = interval;
		this.m_maxDuration = maxDuration;
		this.m_running_id = 0;
		this.m_timeout_id = 0;
		this.m_run_loop = null;
		this.m_run_starttime = 0;
	}

	start(run) {
		return new Promise(async (ok, err)=>{
			if (this.m_running_id) {
				err(Error.new(errno.ERR_MONITOR_BEEN_STARTED));
			} else {
				var id = utils.id;
				this.m_running_id = id;
				this.m_run_starttime = Date.now();
				var isAsync = utils.isAsync(run);

				var run_loop = async()=>{
					if (id == this.m_running_id) {
						try {
							var r = isAsync ? (await run(this)): run(this);
							if (id == this.m_running_id) {
								if (this.m_maxDuration == -1 || 
										this.m_maxDuration > (Date.now() - this.m_run_starttime)) {
									this.m_timeout_id = setTimeout(run_loop, this.m_interval);
									return;
								}
							}
						} catch (e) {
							clear(this); 
							err(e); 
							return;
						}
					}
					clear(this);
					ok(r); // end
				};
				this.m_run_loop = run_loop
				run_loop();
			}
		});
	}

	stop() {
		if (!this.m_running_id) {
			Error.new(errno.ERR_MONITOR_NOT_BEEN_STARTED)
		}
		clearTimeout(this.m_timeout_id);
		this.m_running_id = 0;
		this.m_timeout_id = 0;
		var run_loop = this.m_run_loop;
		if (run_loop) {
			process.nextTick(e=>{
				if (run_loop === this.m_run_loop) {
					run_loop();
				}
			});
		}
	}

	get running() {
		return !!this.m_running_id;
	}

}

exports.Monitor = Monitor;
