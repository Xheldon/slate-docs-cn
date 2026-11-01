'use strict';

// 在 gitbook build 之后运行：给每个 HTML 补 description / 自指 canonical / OG，
// 并写出站点根上的 sitemap.xml 与 robots.txt（同时同步到 public/）。

var fs = require('fs');
var path = require('path');

var ORIGIN = 'https://slate.xheldon.com';
var OG_IMAGE = ORIGIN + '/images/preview.png';
var SITE_NAME = 'Slate 中文';
var SITE_DESCRIPTION = 'Slate 中文文档：完全可定制的富文本编辑器框架，涵盖介绍、实战教程与核心概念（对应 v0.57.1）。';

var ROOT = path.resolve(__dirname, '..');
var BOOK_DIR = process.env.SEO_BOOK_DIR
    ? path.resolve(process.env.SEO_BOOK_DIR)
    : path.join(ROOT, '_book');
var PUBLIC_DIR = process.env.SEO_PUBLIC_DIR
    ? path.resolve(process.env.SEO_PUBLIC_DIR)
    : path.join(ROOT, 'public');

function walkHtml(dir, acc) {
    var names = fs.readdirSync(dir);
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        if (name === 'gitbook') continue;
        var full = path.join(dir, name);
        var stat = fs.statSync(full);
        if (stat.isDirectory()) {
            walkHtml(full, acc);
        } else if (name.length > 5 && name.slice(-5).toLowerCase() === '.html') {
            acc.push(full);
        }
    }
    return acc;
}

function relPosix(file) {
    return path.relative(BOOK_DIR, file).split(path.sep).join('/');
}

function canonicalFor(rel) {
    if (rel === 'index.html') return ORIGIN + '/';
    return ORIGIN + '/' + rel.split('/').map(encodeURIComponent).join('/');
}

function escapeAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function decodeEntities(value) {
    return String(value)
        .replace(/&#x([0-9a-fA-F]+);/g, function(_, hex) {
            return String.fromCharCode(parseInt(hex, 16));
        })
        .replace(/&#(\d+);/g, function(_, num) {
            return String.fromCharCode(parseInt(num, 10));
        })
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function normalizeSpace(value) {
    return String(value).replace(/\s+/g, ' ').trim();
}

function truncate(value, max) {
    if (value.length <= max) return value;
    var cut = value.slice(0, max - 1);
    var best = -1;
    var breaks = ['。', '！', '？', '；', '，', ',', ' '];
    for (var i = 0; i < breaks.length; i++) {
        var idx = cut.lastIndexOf(breaks[i]);
        if (idx > best) best = idx;
    }
    if (best >= 40) {
        var ch = cut.charAt(best);
        if (ch === '。' || ch === '！' || ch === '？' || ch === '；') {
            return cut.slice(0, best + 1);
        }
        return cut.slice(0, best).replace(/[\s，,、]+$/g, '') + '…';
    }
    return cut + '…';
}

function joinParts(parts) {
    var out = '';
    for (var i = 0; i < parts.length; i++) {
        if (!out) {
            out = parts[i];
            continue;
        }
        var prev = out.charAt(out.length - 1);
        if (/[。！？；，、：]/.test(prev)) out += parts[i];
        else out += ' ' + parts[i];
    }
    return out;
}

function descriptionFrom(html) {
    var section = html.match(/<section class="normal markdown-section">([\s\S]*?)<\/section>/);
    var block = section ? section[1] : '';
    block = block.replace(/<blockquote[\s\S]*?<\/blockquote>/g, ' ');
    var re = /<p>([\s\S]*?)<\/p>/g;
    var parts = [];
    var match;
    while ((match = re.exec(block)) && parts.length < 2) {
        var text = normalizeSpace(decodeEntities(match[1].replace(/<[^>]+>/g, '')));
        if (text && text.length >= 8 && text.indexOf('译者注') !== 0) parts.push(text);
    }
    var desc = joinParts(parts);
    if (desc.length < 30) {
        desc = normalizeSpace((desc ? desc + ' ' : '') + SITE_DESCRIPTION);
    }
    if (!desc) desc = SITE_DESCRIPTION;
    return truncate(desc, 160);
}

function titleFrom(html) {
    var match = html.match(/<title>([\s\S]*?)<\/title>/);
    if (!match) return SITE_NAME;
    var title = normalizeSpace(decodeEntities(match[1]));
    return title || SITE_NAME;
}

function seoBlock(title, description, url) {
    var type = url === ORIGIN + '/' ? 'website' : 'article';
    return [
        '<!-- seo:start -->',
        '<link rel="canonical" href="' + escapeAttr(url) + '">',
        '<meta property="og:site_name" content="' + escapeAttr(SITE_NAME) + '">',
        '<meta property="og:locale" content="zh_CN">',
        '<meta property="og:type" content="' + type + '">',
        '<meta property="og:title" content="' + escapeAttr(title) + '">',
        '<meta property="og:description" content="' + escapeAttr(description) + '">',
        '<meta property="og:url" content="' + escapeAttr(url) + '">',
        '<meta property="og:image" content="' + escapeAttr(OG_IMAGE) + '">',
        '<meta property="og:image:width" content="1167">',
        '<meta property="og:image:height" content="850">',
        '<!-- seo:end -->'
    ].join('\n        ');
}

function applyToHtml(html) {
    var title = titleFrom(html);
    var description = descriptionFrom(html);
    var cleaned = html.replace(/\s*<!-- seo:start -->[\s\S]*?<!-- seo:end -->/g, '');
    var meta = '<meta name="description" content="' + escapeAttr(description) + '">';
    if (/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/.test(cleaned)) {
        cleaned = cleaned.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, meta);
    } else if (cleaned.indexOf('</head>') !== -1) {
        cleaned = cleaned.replace('</head>', '        ' + meta + '\n</head>');
    }
    return {
        title: title,
        description: description,
        html: cleaned
    };
}

function injectSeo(html, url) {
    var applied = applyToHtml(html);
    var block = seoBlock(applied.title, applied.description, url);
    if (applied.html.indexOf('</head>') === -1) {
        throw new Error('missing </head> for ' + url);
    }
    applied.html = applied.html.replace('</head>', '        ' + block + '\n</head>');
    applied.url = url;
    return applied;
}

function sitemapXml(urls) {
    var lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    ];
    for (var i = 0; i < urls.length; i++) {
        lines.push('  <url>');
        lines.push('    <loc>' + escapeAttr(urls[i]) + '</loc>');
        lines.push('  </url>');
    }
    lines.push('</urlset>');
    lines.push('');
    return lines.join('\n');
}

function robotsTxt() {
    return [
        'User-agent: *',
        'Allow: /',
        '',
        'Sitemap: ' + ORIGIN + '/sitemap.xml',
        ''
    ].join('\n');
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
}

function copyPublicExtras() {
    if (!fs.existsSync(PUBLIC_DIR)) return;
    var names = fs.readdirSync(PUBLIC_DIR);
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        if (name === 'sitemap.xml' || name === 'robots.txt') continue;
        var src = path.join(PUBLIC_DIR, name);
        if (!fs.statSync(src).isFile()) continue;
        fs.writeFileSync(path.join(BOOK_DIR, name), fs.readFileSync(src));
    }
}

function applySeo() {
    if (!fs.existsSync(BOOK_DIR)) {
        throw new Error('找不到构建目录 ' + BOOK_DIR + '，请先运行 gitbook build');
    }

    var files = walkHtml(BOOK_DIR, []);
    var pages = [];
    for (var i = 0; i < files.length; i++) {
        var rel = relPosix(files[i]);
        // 旧地址由 public/Introduction.html 单独提供跳转，不参与正文 SEO。
        if (rel === 'Introduction.html') continue;
        var html = fs.readFileSync(files[i], 'utf8');
        var url = canonicalFor(rel);
        var applied = injectSeo(html, url);
        fs.writeFileSync(files[i], applied.html);
        pages.push(url);
    }

    if (!pages.length) {
        throw new Error('构建目录里没有可发布的 HTML 页面');
    }

    pages.sort(function(a, b) {
        var home = ORIGIN + '/';
        if (a === home) return -1;
        if (b === home) return 1;
        return a < b ? -1 : a > b ? 1 : 0;
    });

    var sitemap = sitemapXml(pages);
    var robots = robotsTxt();
    fs.writeFileSync(path.join(BOOK_DIR, 'sitemap.xml'), sitemap);
    fs.writeFileSync(path.join(BOOK_DIR, 'robots.txt'), robots);

    ensureDir(PUBLIC_DIR);
    fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemap);
    fs.writeFileSync(path.join(PUBLIC_DIR, 'robots.txt'), robots);
    copyPublicExtras();

    return pages;
}

if (require.main === module) {
    try {
        var pages = applySeo();
        console.log('SEO applied: ' + pages.length + ' urls');
        console.log(pages.join('\n'));
    } catch (err) {
        console.error(err.message || err);
        process.exit(1);
    }
}

module.exports = {
    applySeo: applySeo,
    canonicalFor: canonicalFor,
    descriptionFrom: descriptionFrom,
    injectSeo: injectSeo,
    robotsTxt: robotsTxt,
    SITE_DESCRIPTION: SITE_DESCRIPTION,
    ORIGIN: ORIGIN
};
