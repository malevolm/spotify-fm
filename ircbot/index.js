const IRC = require('irc-framework');
const axios = require('axios');

var bot = new IRC.Client();
var apiBase = 'http://webapi:8000';
var radioBase = 'http://streamer:20300';
var options = {};
var npTimer;

bot.connect({
	host: process.env.IRC_SERVER,
	port: process.env.IRC_PORT,
	nick: process.env.IRC_NICK
});

bot.on('registered', function(event) {
    var chans = process.env.IRC_CHANNELS.split(",");
    chans.forEach(chan => {
        bot.join(chan);
    });
});

bot.on('message', function(event) {
    var args = event.message.split(' ');
    var text = args.slice(1).join(' ');
    var cmd = args[0].substring(1);

    if (event.message.match(/^!get /)) {
        event.reply((getOpt(args[1])||'not set').toString());
    }

    if (event.message.match(/^!set /)) {
        console.log(args, text);
        setOpt(args[1], args.slice(2));
        event.reply('done');
    }

    if (event.message.match(/^!unset /)){
        if(options.hasOwnProperty(args[1])){
            delete options[args[1]];
            event.reply('done');
        } else {
            event.reply('doesnt exist');
        }
    }

  	if (event.message.match(/^!(queue|play) /)) {
        spotifyApi('/search/track/'+cmd+'?q='+text, event, data => {
            if(cmd=='queue')
                return event.reply(makeSpotifyMessage(data));
            return _nowPlaying('/nowplaying', event, true);
        });
  	}

    if (event.message.match(/^!(find|search) /)) {
        var limits = { find : 1, search : 5 };
        spotifyApi('/search/tracks/'+limits[cmd]+'?q='+text, event, data => {
            if(!data.tracks||!data.tracks.items)
                return event.reply('search error');
            data.tracks.items.forEach(item => {
                event.reply(makeSpotifyMessage(item));
            });
        });
    }

    if (event.message.match(/^!(np|skip)/)) {
        paths = { np : '/nowplaying', skip : '/skip' };
        return _nowPlaying(paths[cmd], event, true)
    }

    if (event.message.match(/^!(url|link)/)) {
        spotifyApi('/nowplaying', event, data => {
            return event.reply(data.item && data.item.external_urls.spotify||"couldnt get nowplaying");
        });
    }

    if (event.message.match(/^!help/)) {
        return event.reply("!play !queue !np !skip !find !search !link");
    } 

});

function getOpt(key){
    return options.hasOwnProperty(key) ? options[key] : false;
}

function setOpt(key, val){
    try {
        options[key] = val;
        return val;
    } catch(err) {
        return err.toString();
    }
}

function _nowPlaying(path, event, override, update){
    getListenerNumber(event, listeners => {
        spotifyApi(path, event, data => {
            clearTimeout(npTimer);

            npTimer = setTimeout(() => {
                _nowPlaying('/nowplaying', event, false, true);
            },
            data.item.duration_ms - data.progress_ms + 2000);

            if(override || (getOpt('np') && getOpt('np') != 'iflistening') || (getOpt('np') == 'iflistening' && listeners) )
                event.reply(makeSpotifyMessage(data.item, listeners));

            if(update)
                bot.say(process.env.IRC_RADIO_CHAN, makeSpotifyMessage(data.item, listeners));
        });
    });
}

function getListenerNumber(event, after){
    axios.get(radioBase+'/status-json.xsl').then(res => {
        if(!res||!res.data||!res.data.icestats||!res.data.icestats.source)
            return event.reply('couldnt get radio stats, is it down?');
        after(res.data.icestats.source.listeners);
    }).catch(err => {
        event.reply('radio is down');
    });
}

function spotifyApi(path, event, after){
    axios.get(apiBase+path).then(res => {
        handleUnknownError(res, event, data => {
            after(data);
        });
    }).catch(err => {
        handleHttpError(err, event);
    });
}

function handleUnknownError(res, event, otherwise){
    if(!res||!res.data) return event.reply('unknown error');
    if(res.data.error) return event.reply(res.data.error);
    otherwise(res.data);
}

function handleHttpError(err, event){
    if(!err||!err.response||!err.response.data||!err.response.data.error)
        return event.reply('unknown error');
    event.reply('error: '+err.response.data.error);
}

function makeSpotifyMessage(item, listeners){
    if(!item||!item.name||!item.artists)
        return 'search error';
    var msg = "\x03\x31,9 \u266A \x03 \x03\x31,15 " + item.name + " \x03 by";
    // item.artists.map(a => a.name).forEach(name => {
        msg += " \x03\x31,15 " + item.artists.map(a => a.name).join(', ') + " \x03";
    // });
    if(listeners)
        msg += " \x03\x31,9 "+listeners+" \x03";
    return msg;
}

