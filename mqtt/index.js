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

'use strict'

/**
 * Module dependencies
 */
var utils = require('../util');
var events = require('events')
var Store = require('./store')
var eos = require('./end-of-stream')
var writeToStream = require('./writeToStream');
var Parser = require('./parser');
var Writable = require('stream').Writable
var reInterval = require('./reinterval')
var validations = require('./validations')
var url = require('url');
var net = require('net');
var tls = require('tls');

function defaultId() {
	return 'mqttjs_' + Math.random().toString(16).substr(2, 8);
}

function sendPacket(self, packet, cb) {
	self.emit('packetsend', packet);

	var result = writeToStream(packet, self.stream);

	if (!result && cb) {
		self.stream.once('drain', cb);
	} else if (cb) {
		cb();
	}
}

function flush(queue) {
	if (queue) {
		Object.keys(queue).forEach(function (messageId) {
			if (typeof queue[messageId] === 'function') {
				queue[messageId](new Error('Connection closed'));
				delete queue[messageId];
			}
		})
	}
}

function storeAndSend(self, packet, cb) {
	self.outgoingStore.put(packet, function storedPacket (err) {
		if (err) {
			return cb && cb(err);
		}
		sendPacket(self, packet, cb);
	})
}

function nop() {}

/*
	variables port and host can be removed since
	you have all required information in opts object
*/
function stream_builder_tcp(client, opts) {
	opts.port = opts.port || 1883;
	opts.hostname = opts.hostname || opts.host || '127.0.0.1';
	return net.createConnection(opts.port, opts.hostname);
}

function stream_builder_ssl(mqttClient, opts) {
	opts.port = opts.port || 8883;
	opts.host = opts.hostname || opts.host || '127.0.0.1';
	opts.rejectUnauthorized = opts.rejectUnauthorized !== false;

	delete opts.path;

	var stream = tls.connect(opts);

	/* eslint no-use-before-define: [2, "nofunc"] */
	stream.on('secureConnect', function () {
		if (opts.rejectUnauthorized && !stream.authorized) {
			stream.emit('error', new Error('TLS not authorized'));
		} else {
			stream.removeListener('error', handleTLSerrors);
		}
	});

	function handleTLSerrors(err) {
		// How can I get verify this error is a tls error?
		if (opts.rejectUnauthorized) {
			mqttClient.emit('error', err);
		}

		// close this connection to match the behaviour of net
		// otherwise all we get is an error from the connection
		// and close event doesn't fire. This is a work around
		// to enable the reconnect code to work the same as with
		// net.createConnection
		stream.end();
	}

	stream.on('error', handleTLSerrors);

	return stream;
}

var protocols = {
	mqtt: stream_builder_tcp,
	tcp: stream_builder_tcp,
	mqtts: stream_builder_ssl,
	ssl: stream_builder_ssl,
	tls: stream_builder_ssl,
};

/**
 * Parse the auth attribute and merge username and password in the options object.
 *
 * @param {Object} [opts] option object
 */
function parseAuthOptions(opts) {
	if (opts.auth) {
		var matches = opts.auth.match(/^(.+):(.+)$/);
		if (matches) {
			opts.username = matches[1];
			opts.password = matches[2];
		} else {
			opts.username = opts.auth;
		}
	}
}

/**
 * @param {Object} opts
 */
function resolve_options(opts) {
	// Default options
	opts = utils.assign({
		url: 'mqtt://127.0.0.1:1883',
		keepalive: 60,
		reschedulePings: true,
		protocolId: 'MQTT',
		protocolVersion: 4,
		reconnectPeriod: 1000,
		connectTimeout: 30 * 1000,
		clean: true,
		resubscribe: true,
		clientId: defaultId(),
		outgoingStore: new Store(),
		incomingStore: new Store(),
		queueQoSZero: true,
	}, typeof opts == 'string' ? {url: opts}: opts);

	if (opts.url) {
		opts = Object.assign(url.parse(opts.url, true), opts);
		if (opts.protocol === null) {
			throw new Error('Missing protocol');
		}
		opts.protocol = opts.protocol.replace(/:$/, '');
	}

	opts.port = Number(opts.port) || 1883;

	// merge in the auth options if supplied
	parseAuthOptions(opts);

	// support clientId passed in the query string of the url
	if (opts.query && typeof opts.query.clientId === 'string') {
		opts.clientId = opts.query.clientId;
	}

	if (opts.cert && opts.key) {
		opts.protocol = 'mqtts';
	}
	if (!protocols[opts.protocol]) {
		opts.protocol = 'mqtt';
	}

	if (opts.clean === false && !opts.clientId) {
		throw new Error('Missing clientId for unclean clients');
	}

	return opts;
}

/**
 * @func stream_builder()
 */
function stream_builder(self) {
	var opts = self.options;
	if (opts.servers) {
		if (!self._reconnectCount || 
			self._reconnectCount === opts.servers.length) {
			self._reconnectCount = 0;
		}
		opts.host = opts.servers[self._reconnectCount].host;
		opts.port = opts.servers[self._reconnectCount].port;
		opts.protocol = opts.servers[self._reconnectCount].protocol || opts._protocol;
		opts.hostname = opts.host;
		self._reconnectCount++;
	}
	return protocols[opts.protocol](self, opts);
}

/**
 * @class MqttClient
 */
class MqttClient extends events.EventEmitter {

	/**
	 * MqttClient constructor
	 *
	 * @param {Object} [options] - connection options
	 * (see Connection#connect)
	 */
	constructor(options) {
		super();

		// resolve options
		options = resolve_options(options);
		options._protocol = options.protocol;

		this.options = options;

		// Inflight message storages
		this.outgoingStore = this.options.outgoingStore;
		this.incomingStore = this.options.incomingStore;

		// Should QoS zero messages be queued when the connection is broken?
		this.queueQoSZero = this.options.queueQoSZero;

		// map of subscribed topics to support reconnection
		this._resubscribeTopics = {};

		// map of a subscribe messageId and a topic
		this.messageIdToTopic = {};

		// Ping timer, setup in _setupPingTimer
		this.pingTimer = null;
		// Is the client connected?
		this.connected = false;
		// Are we disconnecting?
		this.disconnecting = false;
		// Packet queue
		this.queue = [];
		// connack timer
		this.connackTimer = null;
		// Reconnect timer
		this.reconnectTimer = null;
		/**
		 * MessageIDs starting with 1
		 * ensure that nextId is min. 1, see https://github.com/mqttjs/MQTT.js/issues/810
		 */
		this.nextId = Math.max(1, Math.floor(Math.random() * 65535));

		// Inflight callbacks
		this.outgoing = {};

		var that = this;

		// Mark connected on connect
		this.on('connect', function () {
			if (this.disconnected) {
				return;
			}

			this.connected = true;
			var outStore = this.outgoingStore.createStream();

			this.once('close', remove);
			outStore.on('end', function () {
				that.removeListener('close', remove);
			});
			outStore.on('error', function (err) {
				that.removeListener('close', remove);
				that.emit('error', err);
			});

			function remove () {
				outStore.destroy();
				outStore = null;
			}

			function storeDeliver () {
				// edge case, we wrapped this twice
				if (!outStore) {
					return;
				}

				var packet = outStore.read(1);
				var cb;

				if (!packet) {
					// read when data is available in the future
					outStore.once('readable', storeDeliver);
					return;
				}

				// Avoid unnecessary stream read operations when disconnected
				if (!that.disconnecting && !that.reconnectTimer) {
					cb = that.outgoing[packet.messageId];
					that.outgoing[packet.messageId] = function (err, status) {
						// Ensure that the original callback passed in to publish gets invoked
						if (cb) {
							cb(err, status);
						}

						storeDeliver();
					}
					that._sendPacket(packet);
				} else if (outStore.destroy) {
					outStore.destroy();
				}
			}

			// start flowing
			storeDeliver();
		});

		// Mark disconnected on stream close
		this.on('close', function () {
			this.connected = false;
			clearTimeout(this.connackTimer);
		})

		// Setup ping timer
		this.on('connect', this._setupPingTimer)

		// Send queued packets
		this.on('connect', function () {
			var queue = this.queue;

			function deliver () {
				var entry = queue.shift();
				var packet = null;

				if (!entry) {
					return;
				}

				packet = entry.packet;

				that._sendPacket(packet, function (err) {
					if (entry.cb) {
						entry.cb(err);
					}
					deliver();
				});
			}

			deliver();
		});

		var firstConnection = true;

		this.on('connect', e=>{
			if (!firstConnection && this.options.clean) {
				if (Object.keys(this._resubscribeTopics).length > 0) {
					if (this.options.resubscribe) {
						this.subscribe(this._resubscribeTopics, {resubscribe:true});
					} else {
						this._resubscribeTopics = {};
					}
				}
			}
			firstConnection = false;
		});

		// Clear ping timer
		this.on('close', function () {
			if (that.pingTimer !== null) {
				that.pingTimer.clear();
				that.pingTimer = null;
			}
		});

		// Setup reconnect timer on disconnect
		this.on('close', this._setupReconnect);

		this._setupStream();
	}

	/**
	 * setup the event handlers in the inner stream.
	 *
	 * @api private
	 */
	_setupStream() {
		var connectPacket;
		var that = this;
		var writable = new Writable();
		var parser = new Parser(this.options);
		var completeParse = null;
		var packets = [];

		this._clearReconnect();

		this.stream = stream_builder(this);

		parser.on('packet', function (packet) {
			packets.push(packet);
		});

		function nextTickWork () {
			process.nextTick(work);
		}

		function work () {
			var packet = packets.shift();
			var done = completeParse;

			if (packet) {
				that._handlePacket(packet, nextTickWork);
			} else {
				completeParse = null;
				done();
			}
		}

		writable._write = function (buf, enc, done) {
			completeParse = done;
			parser.parse(buf);
			work();
		};

		this.stream.pipe(writable);

		// Suppress connection errors
		this.stream.on('error', nop);

		// Echo stream close
		eos(this.stream, this.emit.bind(this, 'close'));

		// Send a connect packet
		connectPacket = Object.create(this.options);
		connectPacket.cmd = 'connect';
		// avoid message queue
		sendPacket(this, connectPacket);

		// Echo connection errors
		parser.on('error', this.emit.bind(this, 'error'));

		// many drain listeners are needed for qos 1 callbacks if the connection is intermittent
		this.stream.setMaxListeners(1000);

		clearTimeout(this.connackTimer);

		this.connackTimer = setTimeout(function () {
			that._cleanUp(true);
		}, this.options.connectTimeout);
	}

	_handlePacket(packet, done) {
		this.emit('packetreceive', packet);

		switch (packet.cmd) {
			case 'publish':
				this._handlePublish(packet, done);
				break
			case 'puback':
			case 'pubrec':
			case 'pubcomp':
			case 'suback':
			case 'unsuback':
				this._handleAck(packet);
				done();
				break;
			case 'pubrel':
				this._handlePubrel(packet, done);
				break;
			case 'connack':
				this._handleConnack(packet);
				done();
				break
			case 'pingresp':
				this._handlePingresp(packet);
				done();
				break
			default:
				// do nothing
				// maybe we should do an error handling
				// or just log it
				break
		}
	}

	_checkDisconnecting(callback) {
		if (this.disconnecting) {
			if (callback) {
				callback(new Error('client disconnecting'));
			} else {
				this.emit('error', new Error('client disconnecting'));
			}
		}
		return this.disconnecting;
	}

	/**
	 * publish - publish <message> to <topic>
	 *
	 * @param {String} topic - topic to publish to
	 * @param {String, Buffer} message - message to publish
	 * @param {Object} [opts] - publish options, includes:
	 *    {Number} qos - qos level to publish on
	 *    {Boolean} retain - whether or not to retain the message
	 *    {Boolean} dup - whether or not mark a message as duplicate
	 * @param {Function} [callback] - function(err){}
	 *    called when publish succeeds or fails
	 * @returns {MqttClient} this - for chaining
	 * @api public
	 *
	 * @example client.publish('topic', 'message');
	 * @example
	 *     client.publish('topic', 'message', {qos: 1, retain: true, dup: true});
	 * @example client.publish('topic', 'message', console.log);
	 */
	publish(topic, message, opts, callback) {
		var packet;

		// .publish(topic, payload, cb);
		if (typeof opts === 'function') {
			callback = opts;
			opts = null;
		}

		// default opts
		opts = utils.assign({qos: 0, retain: false, dup: false}, opts);

		if (this._checkDisconnecting(callback)) {
			return this;
		}

		packet = {
			cmd: 'publish',
			topic: topic,
			payload: message,
			qos: opts.qos,
			retain: opts.retain,
			messageId: this._nextId(),
			dup: opts.dup,
		};

		switch (opts.qos) {
			case 1:
			case 2:
				// Add to callbacks
				this.outgoing[packet.messageId] = callback || nop;
				this._sendPacket(packet);
				break;
			default:
				this._sendPacket(packet, callback);
				break;
		}

		return this;
	}

	/**
	 * subscribe - subscribe to <topic>
	 *
	 * @param {String, Array, Object} topic - topic(s) to subscribe to, supports objects in the form {'topic': qos}
	 * @param {Object} [opts] - optional subscription options, includes:
	 *    {Number} qos - subscribe qos level
	 * @param {Function} [callback] - function(err, granted){} where:
	 *    {Error} err - subscription error (none at the moment!)
	 *    {Array} granted - array of {topic: 't', qos: 0}
	 * @returns {MqttClient} this - for chaining
	 * @api public
	 * @example client.subscribe('topic');
	 * @example client.subscribe('topic', {qos: 1});
	 * @example client.subscribe({'topic': 0, 'topic2': 1}, console.log);
	 * @example client.subscribe('topic', console.log);
	 */
	subscribe(topics, opts = {}, callback = nop) {
		var that = this;

		if (typeof topics === 'string') {
			topics = [topics];
		}

		if (typeof opts == 'function') {
			callback = opts;
			opts = {};
		}

		var qos = opts.qos || 0;

		topics = (Array.isArray(topics) ? 
			topics.map(e=>[e,qos]): Object.entries(topics));

		var invalidTopic = validations.validateTopics(topics);
		if (invalidTopic) {
			setImmediate(callback, new Error('Invalid topic ' + invalidTopic));
			return this;
		}

		if (this._checkDisconnecting(callback)) {
			return this;
		}

		var subs = [];
		var resubscribe = opts.resubscribe;

		for (var [k,qos] of topics) {
			if (!this._resubscribeTopics.hasOwnProperty(k) ||
					this._resubscribeTopics[k] < qos || resubscribe) {
				subs.push({ topic: k, qos: qos, });
			}
		}

		var packet = {
			cmd: 'subscribe',
			subscriptions: subs,
			qos: 1,
			retain: false,
			dup: false,
			messageId: this._nextId(),
		};

		if (!subs.length) {
			callback(null, []);
			return;
		}

		// subscriptions to resubscribe to in case of disconnect
		if (this.options.resubscribe) {
			this.messageIdToTopic[packet.messageId] = topics = [];
			for (var sub of subs) {
				if (this.options.reconnectPeriod > 0) {
					this._resubscribeTopics[sub.topic] = sub.qos;
					topics.push(sub.topic);
				}
			}
		}

		this.outgoing[packet.messageId] = function(err, packet) {
			if (!err) {
				var granted = packet.granted;
				for (var i = 0; i < granted.length; i++) {
					subs[i].qos = granted[i];
				}
			}

			callback(err, subs);
		}

		this._sendPacket(packet);

		return this;
	}

	/**
	 * unsubscribe - unsubscribe from topic(s)
	 *
	 * @param {String, Array} topic - topics to unsubscribe from
	 * @param {Function} [callback] - callback fired on unsuback
	 * @returns {MqttClient} this - for chaining
	 * @api public
	 * @example client.unsubscribe('topic');
	 * @example client.unsubscribe('topic', console.log);
	 */
	unsubscribe(topic, callback = nop) {
		var packet = {
			cmd: 'unsubscribe',
			qos: 1,
			messageId: this._nextId(),
		};

		if (this._checkDisconnecting(callback)) {
			return this;
		}

		if (typeof topic === 'string') {
			packet.unsubscriptions = [topic];
		} else if (typeof topic === 'object' && topic.length) {
			packet.unsubscriptions = topic;
		}

		if (this.options.resubscribe) {
			packet.unsubscriptions.forEach(topic=>delete this._resubscribeTopics[topic]);
		}

		this.outgoing[packet.messageId] = callback;

		this._sendPacket(packet);

		return this;
	}

	/**
	 * end - close connection
	 *
	 * @returns {MqttClient} this - for chaining
	 * @param {Boolean} force - do not wait for all in-flight messages to be acked
	 * @param {Function} cb - called when the client has been closed
	 *
	 * @api public
	 */
	end(force, cb) {
		var that = this;

		if (typeof force === 'function') {
			cb = force;
			force = false;
		}

		function closeStores() {
			that.disconnected = true;
			that.incomingStore.close(function() {
				that.outgoingStore.close(function() {
					if (cb) {
						cb.apply(null, arguments);
					}
					that.emit('end');
				})
			})
			if (that._deferredReconnect) {
				that._deferredReconnect();
			}
		}

		function finish() {
			// defer closesStores of an I/O cycle,
			// just to make sure things are
			// ok for websockets
			that._cleanUp(force, setImmediate.bind(null, closeStores));
		}

		if (this.disconnecting) {
			return this;
		}

		this._clearReconnect();

		this.disconnecting = true;

		if (!force && Object.keys(this.outgoing).length > 0) {
			// wait 10ms, just to be sure we received all of it
			this.once('outgoingEmpty', setTimeout.bind(null, finish, 10));
		} else {
			finish();
		}

		return this;
	}

	/**
	 * removeOutgoingMessage - remove a message in outgoing store
	 * the outgoing callback will be called withe Error('Message removed') if the message is removed
	 *
	 * @param {Number} mid - messageId to remove message
	 * @returns {MqttClient} this - for chaining
	 * @api public
	 *
	 * @example client.removeOutgoingMessage(client.getLastMessageId());
	 */
	removeOutgoingMessage(mid) {
		var cb = this.outgoing[mid];
		delete this.outgoing[mid];
		this.outgoingStore.del({messageId: mid}, function() {
			cb(new Error('Message removed'));
		});
		return this;
	}

	/**
	 * reconnect - connect again using the same options as connect()
	 *
	 * @param {Object} [opts] - optional reconnect options, includes:
	 *    {Store} incomingStore - a store for the incoming packets
	 *    {Store} outgoingStore - a store for the outgoing packets
	 *    if opts is not given, current stores are used
	 * @returns {MqttClient} this - for chaining
	 *
	 * @api public
	 */
	reconnect(opts) {
		var that = this;
		var f = function() {
			if (opts) {
				that.options.incomingStore = opts.incomingStore;
				that.options.outgoingStore = opts.outgoingStore;
			} else {
				that.options.incomingStore = null;
				that.options.outgoingStore = null;
			}
			that.incomingStore = that.options.incomingStore || new Store();
			that.outgoingStore = that.options.outgoingStore || new Store();
			that.disconnecting = false;
			that.disconnected = false;
			that._deferredReconnect = null;
			that._reconnect();
		};

		if (this.disconnecting && !this.disconnected) {
			this._deferredReconnect = f;
		} else {
			f();
		}
		return this;
	}

	/**
	 * _reconnect - implement reconnection
	 * @api privateish
	 */
	_reconnect() {
		this.emit('reconnect');
		this._setupStream();
	}

	/**
	 * _setupReconnect - setup reconnect timer
	 */
	_setupReconnect() {
		var that = this;

		if (!that.disconnecting && !that.reconnectTimer && 
				(that.options.reconnectPeriod > 0)
		) {
			if (!this.reconnecting) {
				this.emit('offline');
				this.reconnecting = true;
			}
			that.reconnectTimer = setInterval(function() {
				that._reconnect();
			}, that.options.reconnectPeriod);
		}
	}

	/**
	 * _clearReconnect - clear the reconnect timer
	 */
	_clearReconnect() {
		if (this.reconnectTimer) {
			clearInterval(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	/**
	 * _cleanUp - clean up on connection end
	 * @api private
	 */
	_cleanUp(forced, done) {
		if (done) {
			this.stream.on('close', done);
		}

		if (forced) {
			if ((this.options.reconnectPeriod === 0) && this.options.clean) {
				flush(this.outgoing);
			}
			this.stream.destroy();
		} else {
			this._sendPacket({ cmd: 'disconnect' }, e=>{
				setImmediate(e=>this.stream.end());
			});
		}

		if (!this.disconnecting) {
			this._clearReconnect();
			this._setupReconnect();
		}

		if (this.pingTimer !== null) {
			this.pingTimer.clear();
			this.pingTimer = null;
		}

		if (done && !this.connected) {
			this.stream.removeListener('close', done);
			done();
		}
	}

	/**
	 * _sendPacket - send or queue a packet
	 * @param {String} type - packet type (see `protocol`)
	 * @param {Object} packet - packet options
	 * @param {Function} cb - callback when the packet is sent
	 * @api private
	 */
	_sendPacket(packet, cb) {

		if (!this.connected) {
			var qos = packet.qos;
			if ((qos === 0 && this.queueQoSZero) || packet.cmd !== 'publish') {
				this.queue.push({ packet: packet, cb: cb });
			} else if (qos > 0) {
				cb = this.outgoing[packet.messageId];
				this.outgoingStore.put(packet, function (err) {
					if (err) {
						return cb && cb(err);
					}
				});
			} else if (cb) {
				cb(new Error('No connection to broker'));
			}
			return;
		}

		// When sending a packet, reschedule the ping timer
		this._shiftPingInterval();

		switch (packet.cmd) {
			case 'publish':
				break;
			case 'pubrel':
				storeAndSend(this, packet, cb);
				return;
			default:
				sendPacket(this, packet, cb);
				return;
		}

		switch (packet.qos) {
			case 2:
			case 1:
				storeAndSend(this, packet, cb);
				break;
			/**
			 * no need of case here since it will be caught by default
			 * and jshint comply that before default it must be a break
			 * anyway it will result in -1 evaluation
			 */
			case 0:
				/* falls through */
			default:
				sendPacket(this, packet, cb);
				break;
		}
	}

	/**
	 * _setupPingTimer - setup the ping timer
	 *
	 * @api private
	 */
	_setupPingTimer() {
		var that = this;
		if (!this.pingTimer && this.options.keepalive) {
			this.pingResp = true;
			this.pingTimer = reInterval(function() {
				that._checkPing();
			}, this.options.keepalive * 1000);
		}
	}

	/**
	 * _shiftPingInterval - reschedule the ping interval
	 *
	 * @api private
	 */
	_shiftPingInterval() {
		if (this.pingTimer && this.options.keepalive && 
			this.options.reschedulePings) {
			this.pingTimer.reschedule(this.options.keepalive * 1000);
		}
	}

	/**
	 * _checkPing - check if a pingresp has come back, and ping the server again
	 *
	 * @api private
	 */
	_checkPing() {
		if (this.pingResp) {
			this.pingResp = false;
			this._sendPacket({ cmd: 'pingreq' });
		} else {
			// do a forced cleanup since socket will be in bad shape
			this._cleanUp(true);
		}
	}

	/**
	 * _handlePingresp - handle a pingresp
	 *
	 * @api private
	 */
	_handlePingresp() {
		this.pingResp = true;
	}

	/**
	 * _handleConnack
	 *
	 * @param {Object} packet
	 * @api private
	 */
	_handleConnack(packet) {
		var rc = packet.returnCode;
		var errors = [
			'',
			'Unacceptable protocol version',
			'Identifier rejected',
			'Server unavailable',
			'Bad username or password',
			'Not authorized',
		];

		clearTimeout(this.connackTimer);

		if (rc === 0) {
			this.reconnecting = false;
			this.emit('connect', packet);
		} else if (rc > 0) {
			var err = new Error('Connection refused: ' + errors[rc]);
			err.code = rc;
			this.emit('error', err);
		}
	}

	/**
	 * _handlePublish
	 *
	 * @param {Object} packet
	 * @api private
	 */
	/*
	those late 2 case should be rewrite to comply with coding style:

	case 1:
	case 0:
		// do not wait sending a puback
		// no callback passed
		if (1 === qos) {
			this._sendPacket({
				cmd: 'puback',
				messageId: mid
			});
		}
		// emit the message event for both qos 1 and 0
		this.emit('message', topic, message, packet);
		this.handleMessage(packet, done);
		break;
	default:
		// do nothing but every switch mus have a default
		// log or throw an error about unknown qos
		break;

	for now i just suppressed the warnings
	*/
	_handlePublish(packet, done) {
		done = typeof done !== 'undefined' ? done : nop;
		var topic = packet.topic.toString();
		var message = packet.payload;
		var qos = packet.qos;
		var mid = packet.messageId;
		var that = this;

		switch (qos) {
			case 2:
				this.incomingStore.put(packet, function (err) {
					if (err) {
						return done(err);
					}
					that._sendPacket({cmd: 'pubrec', messageId: mid}, done);
				});
				break;
			case 1:
				// emit the message event
				this.emit('message', topic, message, packet);
				this.handleMessage(packet, function (err) {
					if (err) {
						return done(err);
					}
					// send 'puback' if the above 'handleMessage' method executed
					// successfully.
					that._sendPacket({cmd: 'puback', messageId: mid}, done);
				});
				break;
			case 0:
				// emit the message event
				this.emit('message', topic, message, packet);
				this.handleMessage(packet, done);
				break;
			default:
				// do nothing
				// log or throw an error about unknown qos
				break;
		}
	}

	/**
	 * Handle messages with backpressure support, one at a time.
	 * Override at will.
	 *
	 * @param Packet packet the packet
	 * @param Function callback call when finished
	 * @api public
	 */
	handleMessage(packet, callback) {
		callback();
	}

	/**
	 * _handleAck
	 *
	 * @param {Object} packet
	 * @api private
	 */
	_handleAck(packet) {
		/* eslint no-fallthrough: "off" */
		var mid = packet.messageId;
		var cb = this.outgoing[mid];

		if (!cb) {
			// Server sent an ack in error, ignore it.
			return;
		}

		// Process
		switch (packet.cmd) {
			case 'pubcomp':
				// same thing as puback for QoS 2
			case 'puback':
				// Callback - we're done
				delete this.outgoing[mid];
				this.outgoingStore.del(packet, cb);
				break;
			case 'pubrec':
				this._sendPacket({ cmd: 'pubrel', qos: 2, messageId: mid });
				break;
			case 'suback':
				delete this.outgoing[mid];
				if (packet.granted.length === 1 && (packet.granted[0] & 0x80) !== 0) {
					// suback with Failure status
					var topics = this.messageIdToTopic[mid];
					if (topics) {
						topics.forEach(topic=>delete this._resubscribeTopics[topic]);
					}
				}
				cb(null, packet);
				break;
			case 'unsuback':
				delete this.outgoing[mid];
				cb(null);
				break;
			default:
				this.emit('error', new Error('unrecognized packet type'));
		}

		if (this.disconnecting && Object.keys(this.outgoing).length === 0) {
			this.emit('outgoingEmpty');
		}
	}

	/**
	 * _handlePubrel
	 *
	 * @param {Object} packet
	 * @api private
	 */
	_handlePubrel(packet, callback) {
		callback = typeof callback !== 'undefined' ? callback : nop;
		var mid = packet.messageId;
		var that = this;

		var comp = {cmd: 'pubcomp', messageId: mid};

		that.incomingStore.get(packet, function (err, pub) {
			if (!err && pub.cmd !== 'pubrel') {
				that.emit('message', pub.topic, pub.payload, pub);
				that.incomingStore.put(packet, function (err) {
					if (err) {
						return callback(err);
					}
					that.handleMessage(pub, function (err) {
						if (err) {
							return callback(err);
						}
						that._sendPacket(comp, callback);
					});
				});
			} else {
				that._sendPacket(comp, callback);
			}
		});
	}

	/**
	 * _nextId
	 * @return unsigned int
	 */
	_nextId() {
		// id becomes current state of this.nextId and increments afterwards
		var id = this.nextId++;
		// Ensure 16 bit unsigned int (max 65535, nextId got one higher)
		if (this.nextId === 65536) {
			this.nextId = 1;
		}
		return id;
	}

	/**
	 * getLastMessageId
	 * @return unsigned int
	 */
	getLastMessageId() {
		return (this.nextId === 1) ? 65535 : (this.nextId - 1);
	}

}

exports.MqttClient = MqttClient;
