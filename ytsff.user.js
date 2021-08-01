// ==UserScript==
// @name        YouTube Sub Feed Filter
// @version     1.0
// @description Filters your YouTube subscriptions feed.
// @match       *://www.youtube.com/*
// @match       *://youtube.com/*
// @namespace   https://greasyfork.org/users/696211-ctl2
// @require     https://greasyfork.org/scripts/419978-key-based-config/code/Key-Based%20Config.js?version=956385
// @grant       GM.setValue
// @grant       GM.getValue
// ==/UserScript==

// User-configurable options

// RegExp flags
const OPTIONS = 'i';

// Data schema

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
    default: '.^'
};
SUB[ORDERING.STREAMS.SCHEDULED] = {
    label: 'Streams (scheduled)',
    type: 'string',
    default: '.^'
};
SUB[ORDERING.STREAMS.LIVE] = {
    label: 'Streams (live)',
    type: 'string',
    default: '.^'
};
SUB[ORDERING.STREAMS.FINISHED] = {
    label: 'Streams (finished)',
    type: 'string',
    default: '.^'
};
SUB[ORDERING.PREMIERS.SCHEDULED] = {
    label: 'Premiers (scheduled)',
    type: 'string',
    default: '.^'
};
SUB[ORDERING.PREMIERS.LIVE] = {
    label: 'Premiers (live)',
    type: 'string',
    default: '.^'
};
SUB[ORDERING.OTHERS] = {
    label: 'Others',
    type: 'string',
    default: '.^'
};

const TITLE = 'YouTube Sub Feed Filter';
const KEY = 'ytsff';
const META = {
    label: 'Channels',
    type: 'string',
    default: '.^',
    sub: SUB
};

// Data storage helpers

function updateConfig(filter) {
    // Show all videos
    hideFromSections();

    // Hide filtered videos
    hideFromSections(filter);
}

function buildConfigButton() {
    const openerParent = document.querySelector('#title-container').querySelector('#top-level-buttons-computed');
    const [openerTemplate] = openerParent.children;
    const opener = openerTemplate.cloneNode(false);

    openerParent.appendChild(opener);
    opener.classList.remove('style-blue-text');
    opener.innerHTML = openerTemplate.innerHTML;

    opener.querySelector('button').innerHTML = openerTemplate.querySelector('button').innerHTML;

    opener.querySelector('a').removeAttribute('href');

    // TODO Build the svg via javascript
    opener.querySelector('yt-icon').innerHTML = `
<svg
    viewBox="0 0 24 24"
    preserveAspectRatio="xMidYMid meet"
    focusable="false"
    style="
        pointer-events: none;
        display: block;
        width: 20px;
        height: 20px;
    "
    class="style-scope yt-icon"
>
    <g class="style-scope yt-icon">
        <path
            d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.1-1.65c.2-.15.25-.42.13-.64l-2-3.46c-.12-.22-.4-.3-.6-.22l-2.5 1c-.52-.4-1.08-.73-1.7-.98l-.37-2.65c-.06-.24-.27-.42-.5-.42h-4c-.27 0-.48.18-.5.42l-.4 2.65c-.6.25-1.17.6-1.7.98l-2.48-1c-.23-.1-.5 0-.6.22l-2 3.46c-.14.22-.08.5.1.64l2.12 1.65c-.04.32-.07.65-.07.98s.02.66.06.98l-2.1 1.65c-.2.15-.25.42-.13.64l2 3.46c.12.22.4.3.6.22l2.5-1c.52.4 1.08.73 1.7.98l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.6-.25 1.17-.6 1.7-.98l2.48 1c.23.1.5 0 .6-.22l2-3.46c.13-.22.08-.5-.1-.64l-2.12-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"
            class="style-scope yt-icon"
        >
        </path>
    </g>
</svg>
    `;

    opener.addEventListener('click', () => {
        const promise = kbcConfigure(KEY, TITLE, META, {'zIndex': 10000});

        promise.then((newConfig) => {
            updateConfig(newConfig);
        }).catch((error) => {
            console.error(error);

            if (window.confirm(
                'An error was thrown by Key-Based Config, indicating that your data may be corrupted.\n' +
                'Error Message: ' + error + '\n\n' +
                'Would you like to clear your saved configs?'
            )) {
                GM.setValue(KEY, []);
            }
        });
    });
}

// Collector helpers

function firstWordEquals(element, word) {
    return element.innerText.split(' ')[0] === word;
}

function getLiveBadge(video) {
    return video.querySelector('.badge-style-type-live-now');
}

function getMetadataLine(video) {
    return video.querySelector('#metadata-line');
}

// Hider helpers

class VideoSectionSplitter {
    hideables = [];

    constructor(videoSection) {
        this.nonHideables = videoSection.querySelectorAll('ytd-grid-video-renderer');
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

function hide(element) {
    element.style.display = 'none';
}

function show(element) {
    element.style.removeProperty('display');
}

// Hider

function hideFromSections(
    // Default to no filter
    filter = [],
    // Default to all currently rendered sections
    sections = [...document.querySelectorAll('ytd-item-section-renderer')]
) {
    for (const section of sections) {
        // Collect hideables and non-hideables
        const splitter = new VideoSectionSplitter(section);

        for (const {'value': channel, sub} of filter) {
            const config = sub.map(({value}) => value);
            const channelRegex = new RegExp(channel, OPTIONS);

            if (!config[ORDERING.ENABLED]) {
                continue;
            }

            splitter.splitScheduledStreams(channelRegex, new RegExp(config[ORDERING.STREAMS.SCHEDULED], OPTIONS));
            splitter.splitLiveStreams(channelRegex, new RegExp(config[ORDERING.STREAMS.LIVE], OPTIONS));
            splitter.splitFinishedStreams(channelRegex, new RegExp(config[ORDERING.STREAMS.FINISHED], OPTIONS));

            splitter.splitScheduledPremiers(channelRegex, new RegExp(config[ORDERING.PREMIERS.SCHEDULED], OPTIONS));
            splitter.splitLivePremiers(channelRegex, new RegExp(config[ORDERING.PREMIERS.LIVE], OPTIONS));

            splitter.splitOthers(channelRegex, new RegExp(config[ORDERING.OTHERS], OPTIONS));
        }

        if (splitter.nonHideables.length === 0) {
            //TODO re-add?

            // Hide full section (including title)
//             hide(videoSection);
        } else {
            // Hide hideable videos
            for (const hideable of splitter.hideables) {
                hide(hideable);
            }

            for (const hideable of splitter.nonHideables) {
                show(hideable);
            }
        }
    }
}

async function hideFromMutations(mutations) {
    // Collect new video sections
    // Today, This week, This month, Older, ...
    const sections = [];

    for (const {addedNodes} of mutations) {
        for (const section of addedNodes) {
            sections.push(section);
        }
    }

    hideFromSections(await GM.getValue(KEY, []), sections);
}

// Main helpers

function getRegexArray(stringArray) {
    return stringArray.map(string => new RegExp(string));
}

function isGridView() {
    return document.querySelector('ytd-expanded-shelf-contents-renderer') === null;
}

function isSubscriptionsPage() {
    return new RegExp('^.*youtube.com/feed/subscriptions(\\?flow=1|\\?pbjreload=\\d+)?$').test(document.URL);
}

function trySetPageLoaderOnclick(pageLoader, cssSelector) {
    if (pageLoader) {
        if (pageLoader.matches) {
            if (pageLoader.matches(cssSelector)) {
                pageLoader.onclick = () => location.assign('https://www.youtube.com/feed/subscriptions');

                return true;
            }
        }
    }

    return false;
}

function simplifyPageLoader(cssSelector) {
    if (!trySetPageLoaderOnclick(document.querySelector(cssSelector), cssSelector)) {
        const pageLoaderObserver = new MutationObserver((newMutations) => {
            for (const mutation of newMutations) {
                for (const node of mutation.addedNodes) {
                    if (trySetPageLoaderOnclick(node, cssSelector)) {
                        // If button has been found, stop searching
                        pageLoaderObserver.disconnect();

                        return;
                    }
                }
            }
        });

        pageLoaderObserver.observe(document.querySelector('ytd-app'), {
            'childList': true,
            'subtree': true
        });
    }
}

// Main

// Hide videos if on the subscriptions page
if (isSubscriptionsPage() && isGridView()) {
    // Allow configuration
    try {
        buildConfigButton();
    } catch (e) {
        const buttonDockObserver = new MutationObserver(() => {
            try {
                buildConfigButton();
                buttonDockObserver.disconnect();
            } catch (e) {
                // Button container still not built
            }
        });

        buttonDockObserver.observe(
            document.querySelector('ytd-browse[page-subtype="subscriptions"]').querySelector('div#contents'), {
                childList: true
            }
        );
    }

    (async () => {
        // Call hide function on page load
        hideFromSections(await GM.getValue(KEY));
    })();

    // Call hide function when new videos are loaded
    new MutationObserver(hideFromMutations).observe(
        document.querySelector('ytd-browse[page-subtype="subscriptions"]').querySelector('div#contents'),
        {childList: true}
    );
}

// Make buttons that navigate to the subscriptions feed trigger normal page loads
simplifyPageLoader('a[title="Subscriptions"]'); // Subscriptions button
simplifyPageLoader('button#button[aria-label="Switch to grid view"]'); // Grid-view button
