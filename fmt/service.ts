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

var utils = require('../util');
var uuid = require('../hash/uuid');
var fmtc = require('./fmtc');
var service = require('../service');
var wss = require('../ws/service');
var errno = require('../errno');

/**
 * @class FMTService
 */
export class FMTService extends wss.WSService {

	/**
	 * @get id client
	 */
	get id() {
		return this.m_id;
	}

	get uuid() {
		return this.m_uuid;
	}

	get time() {
		return this.m_time;
	}

	get user() {
		return this.m_user;
	}

	constructor(conv) {
		super(conv);
		this.m_center = null;
		this.m_id = String(this.params.id);
		this.m_subscribe = new Set();
		this.m_uuid = uuid();
		this.m_user = null;
	}

	async requestAuth() {
		var center = fmtc._fmtc(this.conv.server);
		utils.assert(center, 'FMTService.requestAuth() fmt center No found');
		var user = await center.delegate.auth(this);
		if (user) {
			this.m_user = { ...user, id: this.m_id };
			return true;
		}
	}

	/**
	 * @overwrite
	 */
	async load() {
		var center = fmtc._fmtc(this.conv.server);
		utils.assert(center, 'FMTService.load() FMTC No found');
		await utils.sleep(utils.random(0, 200));
		this.m_time = new Date();
		this.m_user.time = this.m_time;
		try {
			await center.loginFrom(this);
		} catch(err) {
			if (err.code == errno.ERR_REPEAT_LOGIN_FMTC[0])
				await this._repeatForceLogout(err.id);
			throw err;
		}
		this.m_center = center;
	}

	/**
	 * @overwrite
	 */
	async destroy() {
		await this.m_center.logoutFrom(this);
		this.m_center = null;
	}

	/**
	 * @overwrite
	 */
	trigger(event, data, timeout = 0, sender = '') {
		if (this.hasSubscribe({event})) {
			return super.trigger(event, data, timeout, sender);
		}
	}

	reportState(event, id, data) {
		this.trigger(`${event}-${id}`, data);
	}

	_repeatForceLogout() {
		return Promise.race([this._trigger('ForceLogout'), utils.sleep(200)]);
	}

	/**
	 * @func forceLogout() close conv
	 */
	forceLogout() {
		this._repeatForceLogout()
			.then(()=>this.conv.close())
			.catch(()=>this.conv.close());
	}

	// ------------ api ------------

	subscribe({ events }) {
		for (var event of events)
			this.m_subscribe.add(event);
	}

	unsubscribe({ events }) {
		for (var event of events)
			this.m_subscribe.delete(event);
	}

	hasSubscribe({ event }) {
		return this.m_subscribe.has(event);
	}

	hasOnline([id]) {
		return this.m_center.hasOnline(id);
	}

	// /**
	//  * @func publishTo() publish multicast,broadcast event message
	//  */
	// publishTo({ event, data, gid = null }){}

	/**
	 * @func triggerTo() event message
	 */
	triggerTo([id, event, data]) {
		return this.m_center.delegate.triggerTo(id, event, data, this.m_id);
	}

	/**
	 * @func callTo()
	 */
	callTo([id, method, data, timeout]) {
		timeout = Number(timeout) || wss.METHOD_CALL_TIMEOUT; // disable not timeout
		return this.m_center.delegate.callTo(id, method, data, timeout, this.m_id);
	}

	/**
	 * @func sendTo()
	 */
	sendTo([id, method, data]) {
		return this.m_center.delegate.sendTo(id, method, data, this.m_id);
	}

	getUser([id]) {
		return this.m_center.user(id);
	}

}

/**
 * @class FMTServerClient
 */
export class FMTServerClient {

	get id() {
		return this.m_id;
	}

	constructor(center, id) {
		this.m_id = id;
		this.m_center = center;
	}

	trigger(event, data, sender = null) {
		return this.m_center.delegate.triggerTo(this.m_id, event, data, sender);
	}

	call(method, data, timeout = wss.METHOD_CALL_TIMEOUT, sender = null) {
		timeout = Number(timeout) || wss.METHOD_CALL_TIMEOUT; // disable not timeout
		return this.m_center.delegate.callTo(this.m_id, method, data, timeout, sender);
	}

	send(method, data, sender = null) {
		return this.m_center.delegate.sendTo(this.m_id, method, data, sender);
	}

	user() {
		return this.m_center.user(this.m_id);
	}

}

service.set('_fmt', FMTService);