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
var event = require('./event');
var { Notification } = event;
var Service = require('./service').Service;
var Session = require('./session').Session;
var errno = require('./errno');

async function call_func(self, msg) {
	var { data = {}, name: action, callback: cb } = msg;
	var fn = self[action];
	var hasCallback = false;
	var rev = { type: 'callback', callback: cb, service: self.name };

	if (self.server.printLog) {
		console.log('Call', `${self.name}.${action}(${JSON.stringify(data, null, 2)})`);
	}
	
	var callback = function(err, data) {
		if (hasCallback) {
			throw new Error('callback has been completed');
		}
		hasCallback = true;
		
		if (!cb) return; // No callback

		if (self.conv.isOpen) {  // 如果连接断开,将这个数据丢弃
			if (err) {
				rev.error = Error.toJSON(err);
			} else {
				rev.data = data;
			}
			self.conv.send(rev);
		} else {
			console.error('connection dropped, cannot callback');
		}
	};

	if (action in ClientService.prototype) {
		return callback(Error.new(errno.ERR_FORBIDDEN_ACCESS));
	}
	if (typeof fn != 'function') {
		return callback(Error.new('"{0}" no defined function'.format(action)));
	}

	var cb2 = function(data) { callback(null, data) }.catch(callback);
	
	if (util.isAsync(fn)) {
		var r;
		try {
			r = await self[action](data);
		} catch(err) {
			return callback(err);
		}
		callback(null, r)
	} else {
		try {
			fn.call(self, data, cb2);
		} catch(err) {
			callback(err);
		}
	}
}

/**
 * @class ClientService
 * @bases service::Service
 */
var ClientService = util.class('ClientService', Service, {
	
	// @private:
	m_conv: null,
	
	// @public:
	/**
	 * @event onerror
	 */
	onError: null,
	
	/**
	 * conv
	 * @type {conv}
	 */	
	get conv() {
		return this.m_conv;
	},
	
	/**
	 * site session
	 * @type {Session}
	 */
	session: null,
	
	/**
	 * @arg conv {Conversation}
	 * @constructor
	 */
	constructor: function(conv) {
		Service.call(this, conv.request);
		event.initEvents(this);
		this.m_conv = conv;
		this.session = new Session(this);
	},

	/**
	 * @fun receiveMessage # 消息处理器
	 * @arg data {Object}
	 */
	receiveMessage: function(data) {
		if (data.type == 'call') {
			call_func(this, data);
		}
	},
	
	/**
	 * @fun error # trigger error event
	 * @arg err {Error} 
	 */
	error: function(err) {
		this.trigger('Error', Error.new(err));
	},
	
	// @end
});

// ext ClientService class
util.extendClass(ClientService, Notification, {
	// @overwrite:
	trigger: function(event, data) {
		if(this.conv.isOpen) {  // 如果连接断开,将这个数据丢弃
			this.conv.send({
				service: this.name, type: 'event', name: event, data: data,
			});
		}
		return Notification.prototype.trigger.call(this, event, data);
	},
});

exports.ClientService = ClientService;
