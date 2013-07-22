/* global console */

"use strict";

var path = require( "path" );
var fs = require( "fs" );
var crypto = require( "crypto" );
var socketio = require( "socket.io" );
var gaze = require( "gaze" );

module.exports = function( basePath, port, debug ) {
	function log() {
		if ( debug ) {
			var args = Array.prototype.slice.call( arguments );
			args[0] = "[CR] " + args[0];
			console.log.apply( console, args );
		}
	}

	function createChecksum( fullFile ) {
		return crypto
			.createHash( "md5" )
			.update( fs.readFileSync( fullFile ).toString() )
			.digest( "hex" );
	}

	var server = socketio.listen( port, {
		"resource": "/cr",
		"log level": debug ? 5 : 1,
		"browser client cache": !debug
	} );

	server.static.add( "/css-reload.js", {
		file: "client/css-reload.js"
	} );

	var socketCache = {};
	var checksums = {};
	var paths = [basePath + "/**/*.css"];

	if ( debug ) {
		paths.push( basePath + "/client/css-reload.js" );
	}

	console.log( "[CR] Port: %d", port );
	console.log( "[CR] Base path: '%s'", basePath );
	console.log( "[CR] Tag to add to your document: <script src=\"http://localhost:%d/cr/css-reload.js\"></script>", port );

	gaze( paths, function() {
		this.on( "changed", function( fullFile ) {
			var file = fullFile.replace( basePath, "" );
			var checksum = createChecksum( fullFile );

			if ( checksums[fullFile] === checksum ) {
				log( "Gaze said '%s' changed, but checksum is the same", file );
				return;
			}

			checksums[fullFile] = checksum;
			console.log( "[CR] '%s' changed", file );

			if ( file === "/client/css-reload.js" ) {
				server.sockets.emit( "reloadPage" );
			} else {
				var cache = socketCache[fullFile];
				if ( cache ) {
					fetchFile( fullFile, function( content ) {
						cache.forEach( function( socket ) {
							socket.emit( "fileChanged", file, content );
						} );
					} );
				}
			}
		} );
	} );

	function fetchFile( fullFile, callback ) {
		// todo: support external URLs as well?
		log( "Read contents of file '%s'", fullFile );
		callback( fs.readFileSync( fullFile ).toString() );
	}

	function watchFile( socket, file ) {
		var fullFile = path.normalize( basePath + file );
		var cache = socketCache[fullFile];

		if ( !cache ) {
			cache = socketCache[fullFile] = [];
			checksums[fullFile] = createChecksum( fullFile );
		}

		cache.push( socket );

		socket.on( "disconnect", function( ) {
			log( "Stopped watching '%s' for socket '%s'", file, socket.id );
			cache.splice( cache.indexOf( socket ), 1 );
		} );
	}

	server.on( "connection", function( socket ) {
		console.log( "[CR] Socket '%s' connected", socket.id );
		socket.on( "fileAdded", function( file ) {
			log( "Started watching '%s' for socket '%s'", file, socket.id );
			watchFile( socket, file );
		} );
		socket.on( "disconnect", function() {
			console.log( "[CR] Socket '%s' disconnected", socket.id );
		} );
	} );
};