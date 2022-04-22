const SpotifyWebApi = require('spotify-web-api-node');
const WebApiRequest = require('spotify-web-api-node/src/webapi-request');
const HttpManager = require('spotify-web-api-node/src/http-manager');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const res = require('express/lib/response');

let app = express();
let device = {};
let deviceName = 'mydevice';

app.use(bodyParser.json());

app.get('/callback', function(req, res) {
	spotifyApi.authorizationCodeGrant(req.query.code)
		.then(async function(data) {
			console.log('The token expires in ' + data.body['expires_in']);
			console.log('The access token is ' + data.body['access_token']);
			console.log('The refresh token is ' + data.body['refresh_token']);

			spotifyApi.setAccessToken(data.body['access_token']);
			spotifyApi.setRefreshToken(data.body['refresh_token']);

			startRadioPlayback();

			setTimeout(refreshToken, data.body['expires_in']*1000);

		}, function(err) {
			console.log('Something went wrong!', err);
		});

	res.json({
		status: "OK"
	});
});

app.get('/search/tracks', function(req, res, next) {
	searchTracks(req.query.q).then(results => {
		return res.json(results);
	}, next);
});

app.get('/search/tracks/:limit', function(req, res, next) {
	searchTracks(req.query.q, req.params.limit).then(results => {
		return res.json(results);
	}, next);
});

app.get('/search/track/play', function(req, res, next) {
	searchTracks(req.query.q, 1).then(results => {
		playTrack(results.tracks.items[0].id).then(play => {
			nowPlaying().then(playing => {
				return res.json(results);
			}, next);
		}, next);
	}, next);
});

app.get('/search/track/queue', function(req, res, next) {
	searchTracks(req.query.q, 1).then(results => {
		queueTrack(results.tracks.items[0].id).then(result => {
			return res.json(results.tracks.items[0]);
		}, next);
	}, next);
});

app.get('/skip', function(req, res, next) {
	skipToNext().then(skipResult => {
		setTimeout(() => {
			nowPlaying().then(result => {
				res.json(result);
			}, next);
		}, 1000);
	}, next);
});

app.get('/play/:trackId', function(req, res, next) {
	playTrack(req.params.trackId).then(result => {
		nowPlaying().then(playing => {
			return res.json(playing);
		}, next);
	}, next);
});

app.get('/queue/:trackId', function(req, res, next) {
	queueTrack(req.params.trackId).then(result => {
		nowPlaying().then(playing => {
			return res.json(playing);
		}, next);
	}, next);
});

app.get('/nowplaying', function(req, res, next) {
	nowPlaying().then(result => {
		return res.json(result);
	}, next);
});

app.get('/nowplaying/text', function(req, res, next) {
	nowPlaying().then(result => {
		var track = result.item.name;
		var artists = result.item.artists.map(a => a.name);
		var text = track + " - " + artists.join(", ");
		res.send(text);
	}, next);
});

app.use((err, req, res, next) => {
	res.status(500).json({ error : err.toString() });
});

app.listen(8000, function() {
	console.log('Web server listening on port 8000');
});

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_API_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_API_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_API_CALLBACK_URI
});

function setupCredentials() {
	var url = spotifyApi.createAuthorizeURL(['playlist-read-private', 'user-read-currently-playing', 'user-modify-playback-state', 'user-read-playback-state']);
	console.log(url);
}

function refreshToken(){
	spotifyApi.refreshAccessToken().then(data => {
		spotifyApi.setAccessToken(data.body['access_token']);
		setTimeout(refreshToken, data.body['expires_in']*1000);
		console.log('Token refreshed, expires in '+data.body['expires_in']+' seconds');
	}, err => {
		throw new Error('Could not refresh the token!', err.message);
	});
}

function startRadioPlayback(){
	getDevice(deviceName).then(dev => {
		switchDevices(device.id).then(switchResult => {
			console.log('switched to our device', dev);
			device = dev;
		}, handleError);
	}, handleError);
}

function handleError(err){
	if(err.body && err.body.error && err.body.error.message)
		err = err.body.error.message;
	throw new Error(err);
}

async function getDevice(deviceName) {
	return new Promise(async (resolve, reject) => {
		const devices = await spotifyApi.getMyDevices().catch(err => reject(err));
		if(!devices||!devices.body||!devices.body.devices)
			return reject('could not get device list');
		device = devices.body.devices.find(device => device.name === deviceName);
		if(!device)
			return reject('could not find device '+deviceName);
		resolve(device);
	});
}

async function searchTracks(query, limit) {
	return new Promise(async (resolve, reject) => {
		let res = await spotifyApi.searchTracks(query, { limit : limit }).catch(err => reject(err));
		if(!res||!res.body||!res.body.tracks||!res.body.tracks.items)
			return reject('search tracks error');
		if(res.body.tracks.items.length==0)
			return reject('track not found');
		resolve(res.body);
	});
}

async function switchDevices(deviceId) {
	return new Promise(async (resolve, reject) => {
		let res = await spotifyApi.transferMyPlayback([ deviceId ], { play: true }).catch(err => reject(err));
		if(!res) return reject('switch device error');
		resolve(res);
	});
}

async function queueTrack(trackId) {
	return new Promise(async (resolve, reject) => {
		console.log(trackId);
		console.log(device.id);
		let res = await spotifyApi.addToQueue("spotify:track:"+trackId, { device_id : device.id }).catch(err => reject(err));
		if(!res||!res.body) return reject('queue error');
		console.log(res.body);
		resolve(res.body);
	});
}

async function skipToNext() {
	return new Promise(async (resolve, reject) => {
		let res = await spotifyApi.skipToNext({ device_id : device.id }).catch(err => reject(err));
		if(!res||!res.body) return reject('skip error');
		resolve(res.body);
	});
}

async function playTrack(trackId) {
	return new Promise(async (resolve, reject) => {
		let queue = await queueTrack(trackId).catch(err => reject(err));
		setTimeout(function(){
			skipToNext().then(resolve).catch(reject);
		}, 1000);
	})
}

async function nowPlaying() {
	return new Promise(async (resolve, reject) => {
		let res = await spotifyApi.getMyCurrentPlayingTrack().catch(err => reject(err));
		if(!res||!res.body) return reject('could not get playing track');
		resolve(res.body);
	});
}

setupCredentials();
