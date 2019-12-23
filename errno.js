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

module.exports = {
	ERR_MONITOR_BEEN_STARTED: [-30001, 'MONITOR BEEN STARTED'],
	ERR_MONITOR_NOT_BEEN_STARTED: [-30002, 'MONITOR NOT BEEN STARTED'],
	ERR_FORBIDDEN_ACCESS : [-30003, 'FORBIDDEN ACCESS'],
	ERR_CONNECTION_DISCONNECTION: [-30004, 'Connection disconnection'],
	ERR_CONNECTION_CLOSE_STATUS: [-30005, 'Error connection close status'],
	ERR_METHOD_CALL_TIMEOUT: [-30006, 'method call timeout'],
	ERR_DOWNLOAD_FAIL: [-30007, 'Download fail'],
	ERR_ILLEGAL_ACCESS: [-30008, 'Illegal access'],
	ERR_REQUEST_AUTH_FAIL: [-30010, 'request auth fail'],
	ERR_REQUEST_ABORT: [-30011, 'request abort'],
	ERR_HTTP_REQUEST_TIMEOUT: [-10045, 'http request timeout'],
	ERR_METHOD_UNREALIZED: [-10046, 'method unrealized'],
	ERR_PARAM_TYPE_MISMATCH: [-10047, 'param type mismatch'],
	ERR_REPEAT_FNODE_CONNECT: [-10048, 'REPEAT FNODE CONNECT'],
	ERR_FMT_CLIENT_OFFLINE: [-10049, 'FMT CLIENT OFFLINE'],
	ERR_UNABLE_PARSE_JSONB: [-10050, 'Unable to parse jsonb, data corrupted'],
	ERR_FNODE_CONNECT_TIMEOUT: [-10051, 'FNODE CONNECT TIMEOUT'],
	ERR_REQUEST_AUTH_FAIL: [-10052, 'REQUEST AUTH FAIL'],
	ERR_REPEAT_LOGIN_FMTC: [-10053, 'REPEAT LOGIN FMTC'],
	ERR_PREV_PING_NOT_RESOLVE: [-10054, 'Previous Ping not resolved'],
	ERR_PING_TIMEOUT: [-10055, 'Ping timeout'],
	ERR_BAD_ARGUMENT: [-10056, 'bad argument.'],
	ERR_WGET_FORCE_ABORT: [-10057, 'WGET FORCE ABORT'],
};