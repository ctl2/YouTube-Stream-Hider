// ==UserScript==
// @name        YouTube Sub Feed Filter
// @version     1.3
// @description Filters your YouTube subscriptions feed.
// @author      Callum Latham
// @namespace   https://greasyfork.org/users/696211-ctl2
// @match       *://www.youtube.com/*
// @match       *://youtube.com/*
// @require     https://greasyfork.org/scripts/419978-key-based-config/code/Key-Based%20Config.js
// @grant       GM.setValue
// @grant       GM.getValue
// ==/UserScript==

// User config

const LONG_PRESS_TIME = 400;
const REGEXP_FLAGS = 'i';

// Dev config

const FRAME_STYLE = {'zIndex': 10000};
const ORDERING = {
    'ENABLED': 0,
    'STREAMS': {
        'SCHEDULED': 1,
        'LIVE': 2,
        'FINISHED': 3
    },
    'PREMIERS': {
        'SCHEDULED': 4,
        'LIVE': 5
    },
    'OTHERS': 6
};
const SUB = [];

SUB[ORDERING.ENABLED] = {
    label: 'Enabled',
    type: 'boolean',
    default: true
};
SUB[ORDERING.STREAMS.SCHEDULED] = {
    label: 'Streams (scheduled)',
    type: 'string',
    default: '^'
};
SUB[ORDERING.STREAMS.LIVE] = {
    label: 'Streams (live)',
    type: 'string',
    default: '^'
};
SUB[ORDERING.STREAMS.FINISHED] = {
    label: 'Streams (finished)',
    type: 'string',
    default: '^'
};
SUB[ORDERING.PREMIERS.SCHEDULED] = {
    label: 'Premiers (scheduled)',
    type: 'string',
    default: '^'
};
SUB[ORDERING.PREMIERS.LIVE] = {
    label: 'Premiers (live)',
    type: 'string',
    default: '^'
};
SUB[ORDERING.OTHERS] = {
    label: 'Others',
    type: 'string',
    default: '^'
};

const TITLE = 'YouTube Sub Feed Filter';
const KEY = 'ytsff';
const META = {
    label: 'Channels',
    type: 'string',
    default: '^Channel Name$',
    sub: SUB
};

const KEY_IS_ACTIVE = 'ytsff_isActive';

// Video element helpers

function getAllSections() {
    return [...document.querySelectorAll('ytd-item-section-renderer')];
}

function getAllVideos(section) {
    return [...section.querySelectorAll('ytd-grid-video-renderer')];
}

function firstWordEquals(element, word) {
    return element.innerText.split(' ')[0] === word;
}

function getLiveBadge(video) {
    return video.querySelector('.badge-style-type-live-now');
}

function getMetadataLine(video) {
    return video.querySelector('#metadata-line');
}

// Video hiding predicates

class SectionSplitter {
    hideables = [];

    constructor(section) {
        this.nonHideables = getAllVideos(section);
    }

    split(channelRegex, titleRegex, predicate = (() => true)) {
        const newNonHideables = [];

        for (const video of this.nonHideables) {
            if (
                channelRegex.test(video.querySelector('a.yt-formatted-string').innerText) &&
                titleRegex.test(video.querySelector('a#video-title').innerText) &&
                predicate(video)
            ) {
                this.hideables.push(video);
            } else {
                newNonHideables.push(video);
            }
        }

        this.nonHideables = newNonHideables;
    }

    splitScheduledStreams(channelRegex, titleRegex) {
        this.split(channelRegex, titleRegex, (video) => {
            const [schedule] = getMetadataLine(video).children;

            return firstWordEquals(schedule, 'Scheduled');
        });
    }

    splitLiveStreams(channelRegex, titleRegex) {
        this.split(channelRegex, titleRegex, (video) => {
            const liveBadge = getLiveBadge(video);

            return getLiveBadge(video) ?
                firstWordEquals(liveBadge.querySelector('span.ytd-badge-supported-renderer'), 'LIVE') : false;
        });
    }

    splitFinishedStreams(channelRegex, titleRegex) {
        this.split(channelRegex, titleRegex, (video) => {
            const metaDataLine = getMetadataLine(video);

            return metaDataLine.children.length > 1 && firstWordEquals(metaDataLine.children[1], 'Streamed');
        });
    }

    splitScheduledPremiers(channelRegex, titleRegex) {
        this.split(channelRegex, titleRegex, (video) => {
            const [schedule] = getMetadataLine(video).children;

            return firstWordEquals(schedule, 'Premieres');
        });
    }

    splitLivePremiers(channelRegex, titleRegex) {
        this.split(channelRegex, titleRegex, (video) => {
            const liveBadge = getLiveBadge(video);

            return liveBadge ?
                firstWordEquals(liveBadge.querySelector('span.ytd-badge-supported-renderer'), 'PREMIERING') :
                false;
        });
    }

    splitOthers(channelRegex, titleRegex) {
        this.split(channelRegex, titleRegex, (video) => {
            const [, {innerText}] = getMetadataLine(video).children;

            return new RegExp('^\\d+ .+ ago$').test(innerText);
        });
    }
}

// Hider functions

function hideSection(section, doHide = true) {
    if (section.matches(':first-child')) {
        const title = section.querySelector('#title');
        const videoContainer = section.querySelector('#contents').querySelector('#contents');

        if (doHide) {
            title.style.display = 'none';
            videoContainer.style.display = 'none';
            section.style.borderBottom = 'none';
        } else {
            title.style.removeProperty('display');
            videoContainer.style.removeProperty('display');
            section.style.removeProperty('borderBottom');
        }
    } else {
        if (doHide) {
            section.style.display = 'none';
        } else {
            section.style.removeProperty('display');
        }
    }
}

function hideVideo(video, doHide = true) {
    if (doHide) {
        video.style.display = 'none';
    } else {
        video.style.removeProperty('display');
    }
}

function hideFromSections(filters = [], sections = getAllSections()) {
    for (const section of sections) {
        if (section.matches('ytd-continuation-item-renderer')) {
            continue;
        }

        const splitter = new SectionSplitter(section);

        // Separate the section's videos by hideability
        for (const {'value': channel, sub} of filters) {
            const config = sub.map(({value}) => value);
            const channelRegex = new RegExp(channel, REGEXP_FLAGS);

            if (!config[ORDERING.ENABLED]) {
                continue;
            }

            splitter.splitScheduledStreams(channelRegex, new RegExp(config[ORDERING.STREAMS.SCHEDULED], REGEXP_FLAGS));
            splitter.splitLiveStreams(channelRegex, new RegExp(config[ORDERING.STREAMS.LIVE], REGEXP_FLAGS));
            splitter.splitFinishedStreams(channelRegex, new RegExp(config[ORDERING.STREAMS.FINISHED], REGEXP_FLAGS));

            splitter.splitScheduledPremiers(channelRegex, new RegExp(config[ORDERING.PREMIERS.SCHEDULED], REGEXP_FLAGS));
            splitter.splitLivePremiers(channelRegex, new RegExp(config[ORDERING.PREMIERS.LIVE], REGEXP_FLAGS));

            splitter.splitOthers(channelRegex, new RegExp(config[ORDERING.OTHERS], REGEXP_FLAGS));
        }

        if (splitter.nonHideables.length === 0) {
            // Hide full section (including title)
            hideSection(section);
        } else {
            // Hide hideable videos
            for (const video of splitter.hideables) {
                hideVideo(video);
            }
        }
    }
}

async function hideFromMutations(mutations) {
    const sections = [];

    for (const {addedNodes} of mutations) {
        for (const section of addedNodes) {
            sections.push(section);
        }
    }

    hideFromSections(await GM.getValue(KEY, []), sections);
}

function resetConfig() {
    for (const section of getAllSections()) {
        hideSection(section, false);

        for (const video of getAllVideos(section)) {
            hideVideo(video, false);
        }
    }
}

function updateConfig(filter) {
    resetConfig();

    // Hide filtered videos
    hideFromSections(filter);
}

// Button

function getButtonDock() {
    return document
        .querySelector('ytd-browse[page-subtype="subscriptions"]')
        .querySelector('#title-container')
        .querySelector('#top-level-buttons-computed');
}

class ClickHandler {
    constructor(button, onShortClick, onLongClick) {
        this.onShortClick = (function() {
            onShortClick();

            window.clearTimeout(this.longClickTimeout);

            window.removeEventListener('mouseup', this.onShortClick);
        }).bind(this);

        this.onLongClick = (function() {
            window.removeEventListener('mouseup', this.onShortClick);

            onLongClick();
        }).bind(this);

        this.longClickTimeout = window.setTimeout(this.onLongClick, LONG_PRESS_TIME);

        window.addEventListener('mouseup', this.onShortClick);
    }
}

class Button {
    constructor(pageManager) {
        this.pageManager = pageManager;
        this.element = this.getNewButton();

        this.element.addEventListener('mousedown', this.onMouseDown.bind(this));

        GM.getValue(KEY_IS_ACTIVE, true).then((isActive) => {
            this.isActive = isActive;

            if (isActive) {
                this.setButtonActive();

                startHiding();
            }
        });
    }

    addToDOM(button = this.element) {
        const {parentElement} = getButtonDock();
        parentElement.appendChild(button);
    }

    getNewButton() {
        const openerTemplate = getButtonDock().children[1];
        const button = openerTemplate.cloneNode(false);

        this.addToDOM(button);

        button.innerHTML = openerTemplate.innerHTML;

        button.querySelector('button').innerHTML = openerTemplate.querySelector('button').innerHTML;

        button.querySelector('a').removeAttribute('href');

        // TODO Build the svg via javascript
        button.querySelector('yt-icon').innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="-50 -50 400 400">
<g>
<path d="M128.25,175.6c1.7,1.8,2.7,4.1,2.7,6.6v139.7l60-51.3v-88.4c0-2.5,1-4.8,2.7-6.6L295.15,65H26.75L128.25,175.6z"/>
<rect x="13.95" y="0" width="294" height="45"/>
</g>
</svg>
    `;

        return button;
    }

    hide() {
        this.element.style.display = 'none';
    }

    show() {
        this.element.parentElement.appendChild(this.element);
        this.element.style.removeProperty('display');
    }

    setButtonActive() {
        if (this.isActive) {
            this.element.classList.add('style-blue-text');
            this.element.classList.remove('style-opacity');
        } else {
            this.element.classList.add('style-opacity');
            this.element.classList.remove('style-blue-text');
        }
    }

    toggleActive() {
        this.isActive = !this.isActive;

        this.setButtonActive();

        GM.setValue(KEY_IS_ACTIVE, this.isActive);

        if (this.isActive) {
            this.pageManager.start();
        } else {
            this.pageManager.stop();
        }
    }

    onLongClick() {
        const promise = kbcConfigure(KEY, TITLE, META, false, FRAME_STYLE);

        promise.then((newConfig) => {
            if (this.isActive) {
                updateConfig(newConfig);
            }
        }).catch((error) => {
            console.error(error);

            if (window.confirm(
                'An error was thrown by Key-Based Config; Your data may be corrupted.\n' +
                'Error Message: ' + error + '\n\n' +
                'Would you like to clear your saved configs?'
            )) {
                GM.setValue(KEY, []);
            }
        });
    }

    async onMouseDown(event) {
        if (event.button === 0) {
            new ClickHandler(this.element, this.toggleActive.bind(this), this.onLongClick.bind(this));
        }
    }
}

// Page load/navigation handler

class PageManager {
    constructor() {
        this.videoObserver = new MutationObserver(hideFromMutations);
        window.addEventListener('load', this.onLoad.bind(this));
    }

    start() {
        GM.getValue(KEY).then(filters => {
            hideFromSections(filters);
        });

        // Call hide function when new videos are loaded
        this.videoObserver.observe(
            document.querySelector('ytd-browse[page-subtype="subscriptions"]').querySelector('div#contents'),
            {childList: true}
        );
    }

    stop() {
        this.videoObserver.disconnect();

        resetConfig();
    }

    isSubPage() {
        return new RegExp('^.*youtube.com/feed/subscriptions(\\?flow=1|\\?pbjreload=\\d+)?$').test(document.URL);
    }

    isGridView() {
        return document.querySelector('ytd-expanded-shelf-contents-renderer') === null;
    }

    onLoad() {
        // Allow configuration
        if (this.isSubPage() && this.isGridView()) {
            this.button = new Button(this);

            this.button.show();

            this.start();
        }

        document.body.addEventListener('yt-navigate-finish', (function({detail}) {
            this.onNavigate(detail);
        }).bind(this));

        document.body.addEventListener('popstate', (function({state}) {
            this.onNavigate(state);
        }).bind(this));
    }

    onNavigate({endpoint}) {
        if (endpoint.browseEndpoint) {
            const {params, browseId} = endpoint.browseEndpoint;

            if ((params === 'MAE%3D' || (!params && this.isGridView())) && browseId === 'FEsubscriptions') {
                if (!this.button) {
                    this.button = new Button(this)
                }

                this.button.show();

                this.start();

                GM.getValue(KEY).then(filters => {
                    hideFromSections(filters);
                });
            } else {
                if (this.button) {
                    this.button.hide();
                }

                this.videoObserver.disconnect();
            }
        }
    }
}

// Main

new PageManager();
