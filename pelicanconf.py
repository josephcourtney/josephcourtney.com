AUTHOR = 'Joseph Courtney'
SITENAME = 'Joseph Courtney'
SITEURL = 'https://josephcourtney.com'
TIMEZONE = 'US/Eastern'
AVATAR = '/images/me.png'
SIDEBAR_DIGEST = 'Physical Chemist'
FAVICOO = '/extra/favicon.ico'
DISPLAY_PAGES_ON_MENU = True
MENUITEMS = (('Blog', SITEURL),)

DEFAULT_DATE = (1989, 5, 15, 22, 0, 0)

PATH = 'content'


DEFAULT_LANG = 'en'

# Feed generation is usually not desired when developing
FEED_ALL_ATOM = None
CATEGORY_FEED_ATOM = None
TRANSLATION_FEED_ATOM = None
AUTHOR_FEED_ATOM = None
AUTHOR_FEED_RSS = None

STATIC_PATHS = ['images', 'extra']
EXTRA_PATH_METADATA = {
    'extra/custom.css': {'path': 'custom.css'},
    'extra/robots.txt': {'path': 'robots.txt'},
    'extra/favicon.ico': {'path': 'favicon.ico'},
    'extra/CNAME': {'path': 'CNAME'},
    'extra/LICENSE': {'path': 'LICENSE'},
    'extra/README': {'path': 'README'},
}

ARTICLE_PATHS = ['articles']
PAGE_PATHS = ['pages']


# Social widget
SOCIAL = (
    ('twitter', 'http://twitter.com/JosephMCourtney'),
    ('github', 'http://github.com/josephcourtney'),
    ('google_scholar', 'https://scholar.google.com/citations?user=z3J37tYAAAAJ&hl=en'),
    ('orcid', 'https://orcid.org/0000-0003-1455-4349'),
)

DEFAULT_PAGINATION = 10
DISPLAY_SUMMARY = True


# Uncomment following line if you want document-relative URLs when developing
#RELATIVE_URLS = True
