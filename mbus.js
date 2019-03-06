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

/* 
 * Message Bus Based on "mqtt"
 */

var utils = require('./util');
var {MqttClient} = require('./mqtt');
var {Notification} = require('./event');
var {Buffer} = require('buffer');

/**
 * @class NotificationCenter
 */
class NotificationCenter extends Notification {

	get topic() {
		return this.m_topic;
	}

	constructor(url = 'mqtt://127.0.0.1:1883', topic = 'default', options = {}) {
		super();
		var msg = `${url}/${topic}`;
		var cli = new MqttClient({ url, ...options });

		cli.on('message', (topic, data)=>{
			if (topic.indexOf(this.m_topic) == 0) {
				topic = topic.substr(this.m_topic.length + 1);
				data = data.length ? JSON.parse(data.toString('utf8')): undefined;
				this.afterNotificationHandle(topic, data);
			}
		});
		cli.on('reconnect', e=>console.log(`MQTT, ${msg}, reconnect`));
		cli.on('connect', e=>console.log(`MQTT, ${msg}, connect`));
		cli.on('close', e=>console.log(`MQTT, ${msg}, close`));
		cli.on('offline', e=>console.log(`MQTT, ${msg}, offline`));
		cli.on('error', e=>console.error(`MQTT, ${msg}, ${e}`));

		this.m_topic = topic;
		this.m_mqtt = cli
	}
	
	afterNotificationHandle(event, data) {
		return this.getNoticer(event).trigger(data);
	}

	subscribeAll() {
		this.m_mqtt.subscribe(this.m_topic + '/#');
	}

	// @overwrite:
	getNoticer(name) {
		if (!this.hasNoticer(name)) {
			this.m_mqtt.subscribe(this.m_topic + '/' + name); // subscribe message
		}
		return super.getNoticer(name);
	}

	// @overwrite:
	trigger(event, data) {
		return this.publish(event, data);
	}

	publish(event, data) {
		data = new Buffer(JSON.stringify(data) || '');
		return this.m_mqtt.publish(this.m_topic + '/' + event, data);
	}

}

// default application notification center
var default_notification_center = null;

module.exports = {

	NotificationCenter,

	get defaultNotificationCenter() {
		if (!default_notification_center) {
			default_notification_center = new NotificationCenter();
		}
		return default_notification_center;
	},

	set defaultNotificationCenter(value) {
		utils.assert(!default_notification_center);
		utils.assert(value instanceof NotificationCenter);
		default_notification_center = value;
	},

};
