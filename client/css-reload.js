/* global console, io, CSSImportRule */
/*!
 * css-reload
 * https://github.com/peol/css-reload/
 * MIT/GPL Dual License, use whatever fits your project.
 * Copyright(C) Andrée Hansson (@peolanha) 2013
 */
( function( ) {
	"use strict";

	var socket;
	var files = {};

	/**
	 * Convert an array-like object into an actual array.
	 *
	 * @param {Object} The object to convert
	 * @returns {Array} An array converted from the sent in object
	 */

	function toArray( arrayLike ) {
		return Array.prototype.slice.call( arrayLike );
	}

	/**
	 * Convenience method for logging, mostly to easily disable it in the future.
	 */

	function log( ) {
		var args = Array.prototype.slice.call( arguments );
		args[ 0 ] = "[CR] " + args[ 0 ];
		console.log.apply( console, args );
	}

	/**
	 * Normalize a filename by removing origin URL and making sure it's
	 * always an absolute URL. Also resolves relative URLs like foo/../bar.
	 *
	 * @param {String} href The URL to normalize
	 * @param {String} [parent] Parent to prefix the `href` URL with
	 * @returns {String} A normalized (absolute) URL
	 */

	function normalize( href, parent ) {
		var path = href.replace( location.origin, "" );
		var normalized = [ ];

		path.split( "/" ).forEach( function( part ) {
			if ( part === ".." ) {
				normalized.pop( );
			} else {
				normalized.push( part );
			}
		} );

		path = normalized.join( "/" );

		if ( path[ 0 ] !== "/" ) {
			if ( !parent ) {
				path = location.pathname + path;
			} else {
				path = normalize( parent ).split( "/" ).slice( 0, -1 ).join( "/" ) + "/" + path;
			}
		}

		return path.split( "?" )[ 0 ];
	}

	/**
	 * Adds a file to CR, effectively starting to watch it and its dependencies (@imports).
	 *
	 * @param {String} file The file to watch
	 * @param {String} media The media this style triggers on
	 * @param {DOMElement} [insertBefore] An element which should be used when inserting this element into DOM
	 */

	function add( file, media, insertBefore, insertAfter ) {
		var elem;
		if ( !files[ file ] ) {
			elem = document.createElement( "style" );
			files[ file ] = {
				elem: elem,
				insertBefore: insertBefore
			};
			socket.emit( "addFile", file );
		} else {
			elem = files[ file ].elem;
		}
		elem.media = media;
		elem.setAttribute( "data-file", file );
		if ( insertBefore ) {
			insertBefore.parentNode.insertBefore( elem, insertBefore );
		} else if ( insertAfter ) {
			insertAfter.parentNode.insertBefore( elem, insertAfter.nextSibling );
		} else {
			document.head.appendChild( elem );
		}

		return elem;
	}

	/**
	 * Removes a file from the watch list.
	 *
	 * @param {String} file The file path to remove
	 */

	function remove( file ) {
		var name = file.href || file;
		var data = files[ name ];
		data.elem.parentNode.removeChild( data.elem );
		socket.emit( "removeFile", name );
		delete files[ name ];
		if ( file.imports ) {
			file.imports.forEach( remove );
		}
		log( "Removed '%s'", name );
	}

	/**
	 * Used initially to parse the document's stylesheets for files to watch.
	 * It will only watch files which has an actual link (i.e. browsers may hide URL's on
	 * style nodes if they're external).
	 *
	 * @param {CSSStyleSheet} style The style to start traversing from
	 * @param {CSSMediaList} [media] The medialist for the `style`
	 */

	function addFromStyle( style, media ) {
		toArray( style.cssRules ).forEach( function( rule ) {
			if ( rule instanceof CSSImportRule ) {
				addFromStyle( rule.styleSheet, rule.media );
			}
		} );
		if ( style.href ) {
			if ( style.ownerNode ) {
				style.ownerNode.parentNode.removeChild( style.ownerNode );
			}
			add( normalize( style.href ), media && toArray( media ).join( ", " ) || "all" );
		}
	}

	/**
	 * Triggered when the socket is connected and we can start interact
	 * with it.
	 */

	function connected( ) {
		log( "Connected to back-end" );
		toArray( document.styleSheets ).forEach( addFromStyle );
	}

	/**
	 * Removes any comments left in the CSS source.
	 *
	 * @param {String} content The content string
	 * @returns {String} An URL-stripped content string
	 */

	function stripComments( content ) {
		var re_comment = /\/\*([\s\S]+)?\*\//g;
		return content.replace( re_comment, "" );
	}

	/**
	 * Updates the string sent in to make sure @import statements are sync'd with
	 * the file on disk (remove/add them and make sure they're in the right order).
	 *
	 * @param {String} file The file path to the file owning the content
	 * @param {String} content The file content string
	 * @returns {String} An @import-updated content string
	 */

	function updateAndStripImports( file, content ) {
		var re_import = /@import\s+(?:url\()?(["']*)(.+)\1(?:\))?\s*(.*?);/g;
		var oldImports = files[ file ].imports || [ ];
		var newImports = files[ file ].imports = [ ];
		var match, i;

		// process all @import statements
		while ( match = re_import.exec( content ) ) {
			files[ file ].imports.push( {
				href: normalize( match[ 2 ], file ),
				media: match[ 3 ] || "all"
			} );
		}

		// clean up @import statements
		content = content.replace( re_import, "" );

		// clean up old watched files
		for ( i = 0; i < oldImports.length; i++ ) {
			if ( !newImports.filter( function( f1 ) {
				return !oldImports.filter( function( f2 ) {
					return f2.href === f1.href;
				} ).length;
			} ).length ) {
				remove( oldImports[ i ] );
			}
		}

		// add new @import's to watched files
		var prevElem = files[ file ].elem;
		newImports.forEach( function( importedFile, i ) {
			add( importedFile.href, importedFile.media, i === 0 ? prevElem : null, prevElem );
			prevElem = files[ importedFile.href ].elem;
		} );

		return content;
	}

	/**
	 * Parses the sent in string for any external resources and fixes their
	 * paths to make sure they are correct before inserting the content into
	 * an <style> element.
	 *
	 * @param {String} file The file path to the file owning the content
	 * @param {String} content The file content string
	 */

	function updateResourceURLs( file, content ) {
		var re_url = /url\s*\(["'\s]*(.+?)["'\s]*\)/g;
		return content.replace( re_url, function( matches, url ) {
			return "url(" + normalize( url, file ) + ")";
		} );
	}

	/**
	 * Used internally for `updated` to modify the content to make sure it's
	 * ready to be inserted into a <style> element.
	 *
	 * @param {String} file The file which the content resides in
	 * @param {String} content The content to parse and modify
	 * @returns {String} An updated `content` string
	 */

	function updateContent( file, content ) {
		content = stripComments( content );
		content = updateAndStripImports( file, content );
		content = updateResourceURLs( file, content );
		return content;
	}

	/**
	 * Triggered when a file has been changed on the harddrive.
	 *
	 * @param {String} file The file that changed
	 * @param {String} content The files content
	 */

	function updated( file, content ) {
		// TODO: parse content for @import's
		files[ file ].elem.innerHTML = updateContent( file, content );
		log( "Updated '%s'", file );
	}

	var url = document.querySelector( "script[src*='css-reload.js']" ).src.split( "/css-reload.js" )[ 0 ];
	var ioElem = document.createElement( "script" );

	ioElem.onload = function( ) {
		socket = io.connect( url.split( "/" ).slice( 0, -1 ).join( "/" ), {
			resource: "cr"
		} );

		socket.on( "connect", connected );
		socket.on( "reloadPage", location.reload.bind( location ) );
		socket.on( "fileChanged", updated );
	};

	ioElem.src = url + "/socket.io.js";
	document.head.appendChild( ioElem );
}( ) );