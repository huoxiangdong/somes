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

Object.assign(exports, require('./_event'));

const _util = require('./_util');
const EventNoticer = exports.EventNoticer;
const PREFIX = 'on';
const REG = new RegExp('^' + PREFIX);

/**********************************************************************************/

/**
 * @class Notification
 */
class Notification {
	
	/**
	 * @func getNoticer
	 */
	getNoticer(name) {
		var noticer = this[PREFIX + name];
		if ( ! noticer ) {
			noticer = new EventNoticer(name, this);
			this[PREFIX + name] = noticer;
		}
		return noticer;
	}

	/**
	 * @func hasNoticer
	 */
	hasNoticer(name) {
		return (PREFIX + name) in this;
	}
	
	/**
	 * @func addDefaultListener
	 */
	addDefaultListener(name, func) {
		
		if ( typeof func == 'string' ) {
			var func2 = this[func]; // find func 
			
			if ( typeof func2 == 'function' ) {
				return this.getNoticer(name).on(func2, 0); // default id 0
			} else {
				throw Error.new(`Cannot find a function named "${func}"`);
			}
		} else {
			return this.getNoticer(name).on(func, 0); // default id 0
		}
	}
	
	/**
	 * @func removeEventListener(name, listen[,scope[,id]])
	 */
	addEventListener(name, ...args) {
		return this.getNoticer(name).on(...args);
	}

	/**
	 * @func addEventListenerOnce(name, listen[,scope[,id]])
	 */
	addEventListenerOnce(name, ...args) {
		return this.getNoticer(name).once(...args);
	}

	/**
	 * @func addEventListener2(name, listen[,scope[,id]])
	 */
	addEventListener2(name, ...args) {
		return this.getNoticer(name).on2(...args);
	}

	/**
	 * @func addEventListenerOnce2(name, listen[,scope[,id]])
	 */
	addEventListenerOnce2(name, ...args) {
		return this.getNoticer(name).once2(...args);
	}

	/**
	* @func trigger 通知事监听器
	* @arg name {String}       事件名称
	* @arg data {Object}       要发送的消数据
	*/
	trigger(name, data) {
		var noticer = this[PREFIX + name];
		if (noticer) {
			return noticer.trigger(data);
		}
		return 0;
	}
	
	/**
	* @func triggerWithEvent 通知事监听器
	* @arg name {String}       事件名称
	* @arg event {Event}       Event 
	*/
	triggerWithEvent(name, event) {
		var noticer = this[PREFIX + name];
		if (noticer) {
			return noticer.triggerWithEvent(event);
		}
		return 0;
	}

	/**
	 * @func $trigger(name, event, is_event)
	 */
	$trigger(name, event, is_event) {
		var noticer = this[PREFIX + name];
		if (noticer) {
			return noticer.$trigger(event, is_event);
		}
		return 0;
	}

	/**
	 * @func removeEventListener(name,[func[,scope]])
	 */
	removeEventListener(name, ...args) {
		var noticer = this[PREFIX + name];
		if (noticer) {
			noticer.off(...args);
		}
	}
	
	/**
	 * @func removeEventListenerWithScope(scope) 卸载notification上所有与scope相关的侦听器
	 * @arg scope {Object}
	 */
	removeEventListenerWithScope(scope) {
		for ( let noticer of this.allNoticers() ) {
			noticer.off(scope);
		}
	}
	
	/**
	 * @func allNoticers() # Get all event noticer
	 * @ret {Array}
	 */
	allNoticers() {
		return allNoticers(this);
	}

}

/**
 * @fun initEvents(self) init event delegate
 * @arg self     {Object} 
 * @arg argus... {String}  event name
 */
function initEvents(self) {
	if (arguments.length == 1) {
		if (self) {
			var root = self;
			var REG = new RegExp('^' + PREFIX + '[a-zA-Z]');
			while (self !== Object.prototype) {
				for (var e of Object.getOwnPropertyNames(self)) {
					if (REG.test(e)) {
						var name = e.substr(PREFIX.length);
						if (root[PREFIX + name]) {
							return;
						} else {
							root[PREFIX + name] = new EventNoticer(name, root);
						}
					}
				}
				self = self.__proto__;
			}
		}
	} else {
		var args = Array.toArray(arguments);
		for (var i = 1, name; (name = args[i]); i++) {
			self[PREFIX + name] = new EventNoticer(name, self);
		}
	}
}

function allNoticers(notification) {
	var result = [];
	for ( var i in notification ) {
		if ( REG.test(i) ) {
			var noticer = notification[i];
			if ( noticer instanceof EventNoticer ) {
				result.push(noticer);
			}
		}
	}
	return result;
}

exports.Notification = Notification;
exports.initEvents = initEvents;
exports.allNoticers = allNoticers;
