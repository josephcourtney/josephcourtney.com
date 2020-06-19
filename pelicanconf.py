#!/usr/bin/env python
# -*- coding: utf-8 -*- #
from __future__ import unicode_literals

AUTHOR = "Joseph Courtney"
SITENAME = "Joseph Courtney"
SITEURL = ""
TIMEZONE = "America/New_York"
AVATAR = "/images/me.png"
SIDEBAR_DIGEST = "Physical Chemist"
SIDEBAR_DIGEST = "Physical Chemist"
FAVICOO = "/extra/favicon.ico"
DISPLAY_PAGES_ON_MENU = True
MENUITEMS = (("Blog", SITEURL),)

DEFAULT_PAGINATION = 10
DEFAULT_DATE = (1989, 5, 15, 22, 0, 0)

PATH = "content"


DEFAULT_LANG = "en"

STATIC_PATHS = ["images", "extra"]
EXTRA_PATH_METADATA = {
    "extra/custom.css": {"path": "custom.css"},
    "extra/robots.txt": {"path": "robots.txt"},
    "extra/favicon.ico": {"path": "favicon.ico"},
    "extra/CNAME": {"path": "CNAME"},
    "extra/LICENSE": {"path": "LICENSE"},
    "extra/README": {"path": "README"},
}

ARTICLE_PATHS = ["articles"]
PAGE_PATHS = ["pages"]

# Feed generation is usually not desired when developing
FEED_ATOM = "feeds/atom.xml"
AUTHOR_FEED_ATOM = "Joseph Courtney"

# Social widget
SOCIAL = (
    ("twitter", "http://twitter.com/JosephMCourtney"),
    ("github", "http://github.com/josephcourtney"),
    ("google_scholar", "https://scholar.google.com/citations?user=z3J37tYAAAAJ&hl=en"),
    ("orcid", "https://orcid.org/0000-0003-1455-4349"),
)

DISPLAY_SUMMARY = True


# Uncomment following line if you want document-relative URLs when developing
# RELATIVE_URLS = True
