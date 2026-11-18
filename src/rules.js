/* Deetz: detection rules.
 *
 * Each rule:   { id, name, cat, ...matchers, implies?, tags?, ids?, note? }
 *
 * Matchers (any one hit detects the technology; every hit becomes evidence):
 *   dom:     CSS selectors, or { sel, attr } to read a version from an attribute
 *   src:     RegExps tested against every resource URL the page loaded
 *            (scripts, styles, images, iframes, fetch/XHR via Performance API)
 *   html:    RegExps tested against the page's HTML
 *   meta:    { metaName: RegExp }
 *   headers: { headerName: RegExp } (lower-case names; from the page's own response)
 *   cookies: RegExps tested against cookie names
 *   js:      { 'window.path': 'version.path' | true } read from the page's JS world
 *   banner:  RegExps tested against the first 4 KB of fetched JS/CSS files (license banners)
 *   bundle:  RegExps tested against the full text of the page's JavaScript bundles
 *   custom:  name of a detector function in detect.js
 *
 * Version: first capture group of any regex, a js version path, a dom attr,
 *          or the ?ver= query string WordPress appends to assets.
 * weak(x): wraps a matcher whose hit alone only means "likely".
 * implies: ids added as "implied" when this one is found.
 * tags:    [{ tag, js|dom|src|html }]: extra labels such as "App Router".
 * ids:     global RegExps whose matches (or group 1) show as tags, e.g. GTM container IDs.
 * wpSlug:  WordPress plugin folder name(s) that map to this rule.
 */
(() => {
  if (globalThis.DEETZ_RULES) return;

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Any URL whose hostname is, or is a subdomain of, one of the hosts.
  const host = (...hosts) =>
    new RegExp('^https?://(?:[^/?#]+\\.)?(?:' + hosts.map(esc).join('|') + ')(?=[:/?#]|$)', 'i');
  const weak = (x) => (x instanceof RegExp ? { re: x, weak: true } : { sel: x, weak: true });

  const CATEGORIES = [
    ['cms', 'CMS'],
    ['headless', 'Content & media sources'],
    ['commerce', 'Commerce & payments'],
    ['frameworks', 'Frameworks'],
    ['theme', 'Theme'],
    ['plugins', 'Plugins'],
    ['libs', 'JavaScript libraries'],
    ['ui', 'UI & CSS'],
    ['fonts', 'Fonts & icons'],
    ['analytics', 'Analytics'],
    ['monitoring', 'Monitoring & RUM'],
    ['marketing', 'Marketing & tags'],
    ['widgets', 'Widgets & embeds'],
    ['privacy', 'Privacy & security'],
    ['server', 'Server & runtime'],
    ['hosting', 'Hosting & CDN'],
    ['build', 'Build & language'],
    ['packages', 'npm packages'],
    ['security', 'Security headers'],
    ['misc', 'Misc'],
  ];

  const RULES = [
    // ── CMS ──────────────────────────────────────────────────────────────
    { id: 'wordpress', name: 'WordPress', cat: 'cms', implies: ['php', 'mysql'],
      meta: { generator: /^WordPress\s*([\d.]+)?/i },
      headers: { link: /api\.w\.org/i, 'x-pingback': /xmlrpc\.php/i },
      dom: ['link[rel="https://api.w.org/"]', '#wpadminbar'],
      src: [
        /\/wp-includes\/(?:css\/dist\/block-library\/style(?:\.min)?\.css|js\/wp-emoji-release\.min\.js|js\/wp-embed(?:\.min)?\.js)\?ver=(\d+\.\d+(?:\.\d+)?)/,
        /\/wp-(?:content|includes)\//,
        /\/wp-json\//,
      ],
      tags: [
        { tag: 'Multisite', html: /\/wp-content\/uploads\/sites\/\d+\// },
        { tag: 'Bedrock', src: /\/app\/(?:plugins|themes|uploads)\// },
        { tag: 'Block theme', dom: '.wp-site-blocks' },
      ] },
    { id: 'craft', name: 'Craft CMS', cat: 'cms', implies: ['php', 'yii'],
      headers: { 'x-powered-by': /Craft CMS/i },
      cookies: [/^CraftSessionId$/, /^CRAFT_CSRF_TOKEN$/],
      src: [/\/cpresources\//],
      js: { Craft: 'Craft.version' },
      html: [/csrfTokenName["']?\s*[:=]\s*["']CRAFT_CSRF_TOKEN/] },
    { id: 'drupal', name: 'Drupal', cat: 'cms', implies: ['php'],
      meta: { generator: /^Drupal\s*(\d+)?/i },
      headers: { 'x-generator': /Drupal\s*(\d+)?/i, 'x-drupal-cache': /./, 'x-drupal-dynamic-cache': /./ },
      js: { Drupal: true, drupalSettings: true },
      src: [/\/sites\/(?:default|all)\/(?:files|modules|themes)\//, /\/core\/misc\/drupal\.js/] },
    { id: 'joomla', name: 'Joomla', cat: 'cms', implies: ['php'],
      meta: { generator: /Joomla!?\s*([\d.]+)?/i }, js: { Joomla: true },
      src: [/\/media\/(?:jui|system)\/(?:js|css)\//] },
    { id: 'ghost', name: 'Ghost', cat: 'cms', implies: ['node'],
      meta: { generator: /^Ghost\s*([\d.]+)?/i },
      headers: { 'x-ghost-cache-status': /./ },
      dom: ['script[data-ghost]'],
      src: [/\/ghost\/api\//, /@tryghost|\/ghost\/(?:portal|sodo-search|signup-form)/i] },
    { id: 'strapi', name: 'Strapi', cat: 'cms', implies: ['node'], note: 'Headless: detected from its API and upload naming.',
      headers: { 'x-powered-by': /Strapi/i },
      src: [
        weak(/\/uploads\/[\w-]+_[a-f0-9]{10}\.(?:jpe?g|png|webp|gif|svg|avif)(?:[?#]|$)/i),
        /\/api\/[\w-]+\?[^#]*\b(?:populate|pagination\[|filters\[)/i,
      ] },
    { id: 'payload', name: 'Payload CMS', cat: 'cms', implies: ['node'],
      cookies: [/^payload-token$/],
      src: [/\/api\/media\/file\//, weak(/\/api\/[\w-]+\?[^#]*\bdepth=\d/)],
      html: [weak(/payloadcms/i)] },
    { id: 'directus', name: 'Directus', cat: 'cms', implies: ['node'], note: 'Headless: detected from its asset and items API.',
      headers: { 'x-powered-by': /Directus/i },
      src: [
        weak(/\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:[?/#.]|$)/i),
        /\/items\/[\w-]+\?[^#]*\bfields(?:\[\]|=)/i,
      ] },
    { id: 'keystone', name: 'KeystoneJS', cat: 'cms', implies: ['node'], headers: { 'x-powered-by': /Keystone/i } },
    { id: 'apostrophe', name: 'ApostropheCMS', cat: 'cms', implies: ['node'],
      src: [/\/apos-frontend\//], dom: ['[data-apos-area]', '[data-apos-widget]'] },
    { id: 'decap', name: 'Decap CMS', cat: 'cms', src: [/(?:decap|netlify)-cms/i] },
    { id: 'webflow', name: 'Webflow', cat: 'cms',
      meta: { generator: /Webflow/i }, js: { Webflow: true },
      dom: ['html[data-wf-page]', 'html[data-wf-site]'],
      src: [host('website-files.com', 'webflow.com')] },
    { id: 'squarespace', name: 'Squarespace', cat: 'cms',
      js: { Squarespace: true, 'Static.SQUARESPACE_CONTEXT': true },
      src: [host('squarespace.com', 'squarespace-cdn.com')] },
    { id: 'wix', name: 'Wix', cat: 'cms', meta: { generator: /Wix\.com/i },
      src: [host('parastorage.com', 'wixstatic.com')] },
    { id: 'framer', name: 'Framer', cat: 'cms', meta: { generator: /Framer\s*([\w.]+)?/i },
      src: [host('framerusercontent.com')], dom: ['[data-framer-name]', '#__framer-badge-container'] },
    { id: 'hubspot-cms', name: 'HubSpot CMS', cat: 'cms', meta: { generator: /HubSpot/i },
      src: [/\/hubfs\/|\/hs-fs\//], headers: { 'x-hs-hub-id': /./ } },
    { id: 'statamic', name: 'Statamic', cat: 'cms', implies: ['laravel'],
      src: [/\/vendor\/statamic\//], cookies: [/^statamic_session$/] },
    { id: 'kirby', name: 'Kirby', cat: 'cms', implies: ['php'],
      cookies: [/^kirby_session$/], src: [weak(/\/media\/pages\/[^/]+\/[a-f0-9]{10}-\d+\//)] },
    { id: 'expressionengine', name: 'ExpressionEngine', cat: 'cms', implies: ['php'], cookies: [/^exp_/] },
    { id: 'typo3', name: 'TYPO3', cat: 'cms', implies: ['php'],
      meta: { generator: /TYPO3\s*(?:CMS)?\s*([\d.]+)?/i }, src: [/\/typo3(?:conf|temp)\//] },
    { id: 'concrete', name: 'Concrete CMS', cat: 'cms', implies: ['php'],
      meta: { generator: /concrete(?:5| CMS)\s*-?\s*([\d.]+)?/i } },
    { id: 'aem', name: 'Adobe Experience Manager', cat: 'cms', implies: ['java'],
      src: [/\/etc\.clientlibs\//, /\/content\/dam\//] },
    { id: 'sitecore', name: 'Sitecore', cat: 'cms', implies: ['aspnet'],
      cookies: [/^SC_ANALYTICS_GLOBAL_COOKIE$/], src: [weak(/\/-\/media\//)] },
    { id: 'umbraco', name: 'Umbraco', cat: 'cms', implies: ['aspnet'],
      src: [/\/umbraco\//], headers: { 'x-umbraco-version': /([\d.]+)/ } },

    // ── Headless content & media sources (detected from asset/API hosts) ──
    { id: 'sanity', name: 'Sanity', cat: 'headless', src: [host('cdn.sanity.io', 'api.sanity.io', 'apicdn.sanity.io')] },
    { id: 'contentful', name: 'Contentful', cat: 'headless', src: [host('ctfassets.net', 'contentful.com')] },
    { id: 'storyblok', name: 'Storyblok', cat: 'headless', src: [host('storyblok.com')], dom: ['[data-blok-c]'] },
    { id: 'prismic', name: 'Prismic', cat: 'headless', src: [host('prismic.io')] },
    { id: 'datocms', name: 'DatoCMS', cat: 'headless', src: [host('datocms-assets.com', 'datocms.com')] },
    { id: 'hygraph', name: 'Hygraph', cat: 'headless', src: [host('graphassets.com', 'hygraph.com', 'graphcms.com')] },
    { id: 'contentstack', name: 'Contentstack', cat: 'headless', src: [host('contentstack.io', 'contentstack.com')] },
    { id: 'cosmic', name: 'Cosmic', cat: 'headless', src: [host('cosmicjs.com')] },
    { id: 'builderio', name: 'Builder.io', cat: 'headless', src: [host('builder.io')], dom: ['[builder-id]', '.builder-block'] },
    { id: 'kontent', name: 'Kontent.ai', cat: 'headless', src: [host('kc-usercontent.com', 'kontent.ai')] },
    { id: 'buttercms', name: 'ButterCMS', cat: 'headless', src: [host('buttercms.com')] },
    { id: 'agility', name: 'Agility CMS', cat: 'headless', src: [host('aglty.io')] },
    { id: 'tina', name: 'TinaCMS', cat: 'headless', src: [host('tina.io', 'tinajs.io')] },
    { id: 'cloudinary', name: 'Cloudinary', cat: 'headless', src: [host('res.cloudinary.com')] },
    { id: 'imgix', name: 'imgix', cat: 'headless', src: [host('imgix.net')] },
    { id: 'mux', name: 'Mux', cat: 'headless', src: [host('mux.com')] },
    { id: 'supabase', name: 'Supabase', cat: 'headless', src: [/^https?:\/\/[a-z0-9-]+\.supabase\.(?:co|in)\//i],
      bundle: [/supabase-js(?:-web|-node|-react-native)?\/(\d+\.\d+\.\d+)/, /https:\/\/[a-z0-9-]+\.supabase\.(?:co|in)\b/, /@supabase\/(?:supabase-js|auth-js|postgrest-js|realtime-js)/] },
    { id: 'firebase', name: 'Firebase', cat: 'headless',
      src: [host('firebaseio.com', 'firebasestorage.googleapis.com', 'firebaseapp.com')], js: { firebase: 'firebase.SDK_VERSION' },
      bundle: [/firebasejs\/(\d+\.\d+\.\d+)|@firebase\/app/] },

    // ── Commerce & payments ──────────────────────────────────────────────
    { id: 'shopify', name: 'Shopify', cat: 'commerce',
      js: { Shopify: true, ShopifyAnalytics: true },
      src: [host('cdn.shopify.com', 'shopifycdn.net'), /\/cdn\/shop\//],
      headers: { 'x-shopid': /./, 'powered-by': /Shopify/i } },
    { id: 'magento', name: 'Adobe Commerce (Magento)', cat: 'commerce', implies: ['php'],
      js: { Mage: true }, src: [/\/static\/(?:version\d+\/)?frontend\//], cookies: [/^mage-cache-/] },
    { id: 'bigcommerce', name: 'BigCommerce', cat: 'commerce', src: [host('bigcommerce.com')], js: { BCData: true } },
    { id: 'prestashop', name: 'PrestaShop', cat: 'commerce', implies: ['php'],
      js: { prestashop: true }, meta: { generator: /PrestaShop/i } },
    { id: 'snipcart', name: 'Snipcart', cat: 'commerce', src: [host('snipcart.com')] },
    { id: 'stripe', name: 'Stripe', cat: 'commerce', src: [host('js.stripe.com', 'm.stripe.network')], js: { Stripe: true }, bundle: [/js\.stripe\.com\/v3|@stripe\/stripe-js/] },
    { id: 'paypal', name: 'PayPal', cat: 'commerce', src: [/paypal\.com\/sdk\/js|paypalobjects\.com/] },
    { id: 'square', name: 'Square', cat: 'commerce', src: [host('squarecdn.com', 'squareup.com')] },

    // ── Frameworks ───────────────────────────────────────────────────────
    { id: 'nextjs', name: 'Next.js', cat: 'frameworks', implies: ['react'], bundle: [/__NEXT_P|next\/dist\/(?:client|shared)/],
      js: { __NEXT_DATA__: true, next: 'next.version', __next_f: true },
      src: [/\/_next\/static\//, /\/_next\/image\?/],
      headers: { 'x-powered-by': /Next\.js\s*([\d.]+)?/i, 'x-nextjs-cache': /./, 'x-nextjs-prerender': /./, 'x-nextjs-stale-time': /./ },
      tags: [
        { tag: 'App Router', js: '__next_f' },
        { tag: 'Pages Router', js: '__NEXT_DATA__' },
        { tag: 'Turbopack', src: /turbopack/i },
      ] },
    { id: 'nuxt', name: 'Nuxt', cat: 'frameworks', implies: ['vue'],
      js: { __NUXT__: true, $nuxt: true, useNuxtApp: true },
      src: [/\/_nuxt\//], dom: ['#__nuxt', '#__layout'],
      tags: [{ tag: 'Nuxt 3+', dom: 'script#__NUXT_DATA__' }] },
    { id: 'remix', name: 'Remix', cat: 'frameworks', implies: ['react'], js: { __remixContext: true, __remixManifest: true } },
    { id: 'react-router', name: 'React Router', cat: 'frameworks',
      js: { __reactRouterVersion: '__reactRouterVersion', __reactRouterContext: true },
      tags: [{ tag: 'Framework mode', js: '__reactRouterContext' }] },
    { id: 'gatsby', name: 'Gatsby', cat: 'frameworks', implies: ['react'],
      dom: ['#___gatsby'], meta: { generator: /Gatsby\s*([\d.]+)?/i } },
    { id: 'sveltekit', name: 'SvelteKit', cat: 'frameworks', implies: ['svelte'],
      js: { '@sveltekit': true }, src: [/\/_app\/immutable\//],
      dom: ['[data-sveltekit-preload-data]', '[data-sveltekit-hydrate]'] },
    { id: 'astro', name: 'Astro', cat: 'frameworks',
      meta: { generator: /^Astro\s*v?([\d.]+)?/i }, dom: ['astro-island'], src: [/\/_astro\//],
      html: [/data-astro-cid-[a-z0-9]+/] },
    { id: 'angular', name: 'Angular', cat: 'frameworks', dom: [{ sel: '[ng-version]', attr: 'ng-version' }] },
    { id: 'angularjs', name: 'AngularJS', cat: 'frameworks',
      js: { angular: 'angular.version.full' }, dom: ['[ng-app]', '[data-ng-app]'] },
    { id: 'react', name: 'React', cat: 'frameworks',
      js: { '@react': '@react', React: 'React.version' },
      bundle: [/version:"(\d+\.\d+\.\d+)",rendererPackageName:"react-dom"/, /"(\d+\.\d+\.\d+)",\s*rendererPackageName:"react-dom"/],
      src: [/\/react(?:-dom)?(?:\.production|\.development)?(?:\.min)?\.js/i],
      banner: [/@license React v([\d.]+)/] },
    { id: 'vue', name: 'Vue.js', cat: 'frameworks',
      js: { '@vue': '@vue', Vue: 'Vue.version', __VUE__: true },
      banner: [/Vue\.js v([\d.]+)/], dom: [weak('[data-v-app]')] },
    { id: 'preact', name: 'Preact', cat: 'frameworks', js: { __PREACT_DEVTOOLS__: true, preact: true } },
    { id: 'svelte', name: 'Svelte', cat: 'frameworks', html: [weak(/class="[^"]*\bsvelte-[a-z0-9]{5,7}\b/)] },
    { id: 'solid', name: 'SolidJS', cat: 'frameworks', js: { _$HY: true }, dom: [weak('[data-hk]')] },
    { id: 'qwik', name: 'Qwik', cat: 'frameworks', dom: [{ sel: '[q\\:container]', attr: 'q:version' }] },
    { id: 'ember', name: 'Ember.js', cat: 'frameworks', js: { Ember: 'Ember.VERSION' }, dom: [weak('.ember-application')] },
    { id: 'alpine', name: 'Alpine.js', cat: 'frameworks', js: { Alpine: 'Alpine.version' }, dom: [weak('[x-data]')] },
    { id: 'htmx', name: 'htmx', cat: 'frameworks', js: { htmx: 'htmx.version' }, dom: ['[hx-get],[hx-post],[hx-boost]'] },
    { id: 'turbo', name: 'Hotwire Turbo', cat: 'frameworks', js: { Turbo: true }, dom: ['turbo-frame', 'meta[name="turbo-visit-control"]'] },
    { id: 'stimulus', name: 'Stimulus', cat: 'frameworks', js: { Stimulus: true }, dom: [weak('[data-controller]')] },
    { id: 'livewire', name: 'Livewire', cat: 'frameworks', implies: ['laravel'],
      js: { Livewire: true }, dom: ['[wire\\:id]', '[wire\\:snapshot]'] },
    { id: 'inertia', name: 'Inertia.js', cat: 'frameworks', dom: ['#app[data-page]'] },
    { id: 'rn-web', name: 'React Native Web', cat: 'frameworks', implies: ['react'], dom: ['style#react-native-stylesheet'], bundle: [/react-native-web/] },
    { id: 'reanimated', name: 'Reanimated', cat: 'libs', bundle: [/react-native-reanimated|ReanimatedError|__reanimatedLoggerConfig|useWebEventHandlers\)\(\)/] },
    { id: 'rngh', name: 'React Native Gesture Handler', cat: 'libs', bundle: [/RNGestureHandler|GestureHandlerRootView/] },
    { id: 'rnsvg', name: 'react-native-svg', cat: 'libs', bundle: [/RNSVG(?:Path|Svg|Group)/] },
    { id: 'async-storage', name: 'AsyncStorage', cat: 'libs', bundle: [/@react-native-async-storage|AsyncStorage/] },
    { id: 'expo-image', name: 'expo-image', cat: 'libs', bundle: [/"expo-image"|ExpoImage/] },
    { id: 'expo-vector-icons', name: '@expo/vector-icons', cat: 'fonts', src: [/node_modules\/@expo\/vector-icons/, /material-community\.(?:woff2?|ttf)/], bundle: [/@expo\/vector-icons/] },
    { id: 'expo', name: 'Expo', cat: 'frameworks', implies: ['rn-web'], src: [/\/_expo\/static\//], bundle: [/expo-modules-core|ExpoModulesCore|__expo-metro-runtime/],
      tags: [{ tag: 'Expo Router', bundle: /expo-router/ }, { tag: 'static export', src: /\/_expo\/static\/js\/web\// }] },
    { id: 'flutter', name: 'Flutter Web', cat: 'frameworks', js: { _flutter: true },
      dom: ['flt-glass-pane', 'flutter-view'], src: [/\/flutter(?:_bootstrap)?\.js/] },
    { id: 'meteor', name: 'Meteor', cat: 'frameworks', implies: ['node'], js: { Meteor: 'Meteor.release' } },

    // ── JavaScript libraries ─────────────────────────────────────────────
    { id: 'jquery', name: 'jQuery', cat: 'libs', js: { jQuery: 'jQuery.fn.jquery' },
      src: [/\/jquery(?:-([\d.]+?))?(?:\.slim)?(?:\.min)?\.js/i], banner: [/jQuery (?:JavaScript Library )?v([\d.]+)/i] },
    { id: 'jquery-migrate', name: 'jQuery Migrate', cat: 'libs',
      js: { 'jQuery.migrateVersion': 'jQuery.migrateVersion' }, src: [/jquery-migrate(?:-([\d.]+))?(?:\.min)?\.js/i] },
    { id: 'jquery-ui', name: 'jQuery UI', cat: 'libs', js: { 'jQuery.ui': 'jQuery.ui.version' },
      src: [/jquery-ui(?:[-.]([\d.]+))?(?:\.custom)?(?:\.min)?\.(?:js|css)/i, /\/jquery\/ui\/core(?:\.min)?\.js/] },
    { id: 'lodash', name: 'Lodash', cat: 'libs', js: { '_.flatMapDeep': '_.VERSION' }, bundle: [/__lodash_hash_undefined__/] },
    { id: 'underscore', name: 'Underscore.js', cat: 'libs', src: [/\/underscore(?:[-.]min)?\.js/i] },
    { id: 'backbone', name: 'Backbone.js', cat: 'libs', js: { Backbone: 'Backbone.VERSION' }, src: [/\/backbone(?:[-.]min)?\.js/i] },
    { id: 'moment', name: 'Moment.js', cat: 'libs', js: { moment: 'moment.version' }, src: [/\/moment(?:-with-locales)?(?:\.min)?\.js/i] },
    { id: 'dayjs', name: 'Day.js', cat: 'libs', js: { dayjs: true }, bundle: [/\$isDayjsObject/] },
    { id: 'gsap', name: 'GSAP', cat: 'libs', js: { gsap: 'gsap.version', TweenMax: 'TweenMax.version' }, banner: [/GSAP ([\d.]+)/] },
    { id: 'threejs', name: 'Three.js', cat: 'libs', js: { THREE: 'THREE.REVISION' } },
    { id: 'chartjs', name: 'Chart.js', cat: 'libs', js: { Chart: 'Chart.version' }, banner: [/Chart\.js v([\d.]+)/], src: [/\/chart(?:\.umd)?(?:\.min)?\.js/i] },
    { id: 'apexcharts', name: 'ApexCharts', cat: 'libs', js: { ApexCharts: true }, src: [/apexcharts/i] },
    { id: 'd3', name: 'D3', cat: 'libs', js: { d3: 'd3.version' } },
    { id: 'highcharts', name: 'Highcharts', cat: 'libs', js: { Highcharts: 'Highcharts.version' } },
    { id: 'swiper', name: 'Swiper', cat: 'libs', js: { Swiper: true }, dom: ['.swiper-initialized', '.swiper-container'], banner: [/Swiper ([\d.]+)/] },
    { id: 'slick', name: 'Slick', cat: 'libs', js: { 'jQuery.fn.slick': true }, dom: ['.slick-slider'],
      src: [/accessible-slick@([\d.]+)/i, /slick-carousel@([\d.]+)/i, /\/slick(?:\.min)?\.(?:js|css)/i],
      tags: [{ tag: 'accessible-slick', src: /accessible-slick/i }] },
    { id: 'splide', name: 'Splide', cat: 'libs', js: { Splide: true }, dom: ['.splide'] },
    { id: 'flickity', name: 'Flickity', cat: 'libs', js: { Flickity: true }, dom: ['.flickity-enabled'] },
    { id: 'lottie', name: 'Lottie', cat: 'libs', js: { lottie: true, bodymovin: true }, dom: ['lottie-player', 'dotlottie-player'] },
    { id: 'lenis', name: 'Lenis', cat: 'libs', js: { Lenis: true }, dom: ['html.lenis'] },
    { id: 'barba', name: 'Barba.js', cat: 'libs', js: { barba: 'barba.version' } },
    { id: 'aos', name: 'AOS', cat: 'libs', js: { AOS: true }, dom: [weak('[data-aos]')] },
    { id: 'lazysizes', name: 'LazySizes', cat: 'libs', js: { lazySizes: true, lazySizesConfig: true }, dom: [weak('.lazyload')],
      src: [/\/lazysizes(?:\.min)?\.js/i] },
    { id: 'clipboardjs', name: 'Clipboard.js', cat: 'libs', js: { ClipboardJS: true } },
    { id: 'select2', name: 'Select2', cat: 'libs', js: { 'jQuery.fn.select2': true }, dom: ['.select2-container'], banner: [/Select2 ([\d.]+)/] },
    { id: 'choices', name: 'Choices.js', cat: 'libs', js: { Choices: true } },
    { id: 'flatpickr', name: 'flatpickr', cat: 'libs', js: { flatpickr: true } },
    { id: 'tippy', name: 'Tippy.js', cat: 'libs', js: { tippy: true } },
    { id: 'popper', name: 'Popper', cat: 'libs', js: { Popper: true } },
    { id: 'corejs', name: 'core-js', cat: 'libs', js: { '__core-js_shared__': '__core-js_shared__.versions.0.version' } },
    { id: 'plupload', name: 'Plupload', cat: 'libs', js: { plupload: 'plupload.VERSION' } },
    { id: 'moxie', name: 'mOxie', cat: 'libs', js: { mOxie: true, moxie: true } },
    { id: 'tinymce', name: 'TinyMCE', cat: 'libs', js: { tinymce: 'tinymce.majorVersion' } },
    { id: 'mediaelement', name: 'MediaElement.js', cat: 'libs', js: { mejs: 'mejs.version', MediaElementPlayer: true }, dom: ['.mejs-container'] },
    { id: 'videojs', name: 'Video.js', cat: 'libs', js: { videojs: 'videojs.VERSION' } },
    { id: 'plyr', name: 'Plyr', cat: 'libs', js: { Plyr: true } },
    { id: 'hlsjs', name: 'hls.js', cat: 'libs', js: { Hls: 'Hls.version' } },
    { id: 'modernizr', name: 'Modernizr', cat: 'libs', js: { Modernizr: 'Modernizr._version' } },
    { id: 'webfontloader', name: 'Web Font Loader', cat: 'libs', js: { WebFont: true } },
    { id: 'polyfill-io', name: 'polyfill.io', cat: 'libs', src: [host('polyfill.io')],
      note: 'This CDN was compromised in 2024 and served malicious code. Remove it.' },

    // Detected from the JavaScript bundles themselves (Deetz reads the page's own JS files).
    { id: 'axios', name: 'Axios', cat: 'libs', bundle: [/AxiosError|axios\/(\d+\.\d+\.\d+)/] },
    { id: 'zod', name: 'Zod', cat: 'libs', bundle: [/ZodError|invalid_type_error/] },
    { id: 'redux', name: 'Redux', cat: 'libs', bundle: [/@@redux\/INIT/] },
    { id: 'zustand', name: 'Zustand', cat: 'libs', bundle: [/\[zustand|zustand\/(?:middleware|vanilla)/] },
    { id: 'tanstack-query', name: 'TanStack Query', cat: 'libs', bundle: [/Missing queryFn|tanstack\/(?:react-)?query/] },
    { id: 'tanstack-table', name: 'TanStack Table', cat: 'libs', bundle: [/getCoreRowModel|tanstack\/(?:react-)?table/] },
    { id: 'react-hook-form', name: 'React Hook Form', cat: 'libs', bundle: [/react-hook-form|useFormContext/] },
    { id: 'framer-motion', name: 'Framer Motion', cat: 'libs', bundle: [/framer-motion|framerAppearId|data-projection-id/] },
    { id: 'immer', name: 'Immer', cat: 'libs', bundle: [/\[Immer\]|immerable/] },
    { id: 'rxjs', name: 'RxJS', cat: 'libs', bundle: [/rxjs|ObjectUnsubscribedError/] },
    { id: 'i18next', name: 'i18next', cat: 'libs', bundle: [/i18next/] },
    { id: 'apollo', name: 'Apollo Client', cat: 'libs', js: { __APOLLO_CLIENT__: true }, bundle: [/ApolloClient|__APOLLO_CLIENT__/] },
    { id: 'urql', name: 'urql', cat: 'libs', bundle: [/@urql\/core|urql/] },
    { id: 'socketio', name: 'Socket.IO', cat: 'libs', bundle: [/socket\.io(?:-client)?/] },
    { id: 'pusher', name: 'Pusher', cat: 'libs', bundle: [/pusher-js|js\.pusher\.com/] },
    { id: 'codemirror', name: 'CodeMirror', cat: 'libs', bundle: [/cm-editor|@codemirror\//] },
    { id: 'monaco', name: 'Monaco Editor', cat: 'libs', bundle: [/monaco-editor/] },
    { id: 'shiki', name: 'Shiki', cat: 'libs', bundle: [/shiki/] },
    { id: 'workbox', name: 'Workbox', cat: 'libs', bundle: [/workbox-(?:window|sw|core)/] },
    { id: 'clerk', name: 'Clerk', cat: 'privacy', bundle: [/clerk\.(?:browser|accounts)|@clerk\//], src: [host('clerk.accounts.dev', 'clerk.com')] },
    { id: 'auth0', name: 'Auth0', cat: 'privacy', bundle: [/auth0-spa-js|\.auth0\.com/] },
    { id: 'nextauth', name: 'Auth.js (NextAuth)', cat: 'privacy', bundle: [/next-auth|\/api\/auth\/session/] },
    { id: 'openai', name: 'OpenAI API (client-side)', cat: 'headless', bundle: [/api\.openai\.com/] },
    { id: 'vercel-ai', name: 'Vercel AI SDK', cat: 'libs', bundle: [/@ai-sdk\/|ai\/rsc|useChat\b/] },
    { id: 'resend-client', name: 'Resend (client-side call)', cat: 'marketing', bundle: [/api\.resend\.com/] },

    // ── UI & CSS ─────────────────────────────────────────────────────────
    { id: 'tailwind', name: 'Tailwind CSS', cat: 'ui', custom: 'tailwind', banner: [/tailwindcss v([\d.]+)/i] },
    { id: 'bootstrap', name: 'Bootstrap', cat: 'ui',
      js: { 'bootstrap.Tooltip': 'bootstrap.Tooltip.VERSION', 'jQuery.fn.tooltip.Constructor': 'jQuery.fn.tooltip.Constructor.VERSION' },
      src: [/\/bootstrap(?:\.bundle)?(?:\.min)?\.(?:js|css)/i, host('bootstrapcdn.com')],
      banner: [/Bootstrap\s+v([\d.]+)/i] },
    { id: 'bulma', name: 'Bulma', cat: 'ui', banner: [/bulma\.io v([\d.]+)/i], src: [/\/bulma(?:\.min)?\.css/i] },
    { id: 'foundation', name: 'Foundation', cat: 'ui', js: { Foundation: 'Foundation.version' } },
    { id: 'uikit', name: 'UIkit', cat: 'ui', js: { UIkit: 'UIkit.version' } },
    { id: 'mui', name: 'Material UI', cat: 'ui', dom: ['.MuiButtonBase-root', '.MuiPaper-root', '[class*="MuiBox-root"]'] },
    { id: 'chakra', name: 'Chakra UI', cat: 'ui', dom: ['.chakra-portal', '[class*="chakra-"]'] },
    { id: 'antd', name: 'Ant Design', cat: 'ui', dom: ['[class*="ant-btn"]', '.ant-layout'] },
    { id: 'radix', name: 'Radix UI', cat: 'ui', dom: ['[data-radix-popper-content-wrapper],[data-radix-collection-item],[data-radix-scroll-area-viewport]'] },
    { id: 'headlessui', name: 'Headless UI', cat: 'ui', dom: ['[id^="headlessui-"]'] },
    { id: 'styled-components', name: 'styled-components', cat: 'ui', dom: [{ sel: 'style[data-styled]', attr: 'data-styled-version' }] },
    { id: 'emotion', name: 'Emotion', cat: 'ui', dom: ['style[data-emotion]'] },
    { id: 'animatecss', name: 'Animate.css', cat: 'ui', dom: ['.animate__animated'], src: [/\/animate(?:\.min)?\.css/i] },
    { id: 'normalize', name: 'normalize.css', cat: 'ui', banner: [/normalize\.css v([\d.]+)/] },

    // ── Fonts & icons ────────────────────────────────────────────────────
    { id: 'google-fonts', name: 'Google Fonts', cat: 'fonts', src: [host('fonts.googleapis.com', 'fonts.gstatic.com')] },
    { id: 'adobe-fonts', name: 'Adobe Fonts', cat: 'fonts', src: [host('use.typekit.net', 'p.typekit.net')], js: { Typekit: true } },
    { id: 'bunny-fonts', name: 'Bunny Fonts', cat: 'fonts', src: [host('fonts.bunny.net')] },
    { id: 'fontshare', name: 'Fontshare', cat: 'fonts', src: [host('api.fontshare.com')] },
    { id: 'fontawesome', name: 'Font Awesome', cat: 'fonts',
      src: [/font-?awesome/i, host('fontawesome.com')],
      banner: [/Font Awesome (?:Free |Pro )?([\d.]+)/i],
      dom: [weak('i.fa,i.fas,i.far,i.fab,i.fa-solid,i.fa-brands,i.fa-regular')] },
    { id: 'twemoji', name: 'Twemoji', cat: 'fonts', src: [/twemoji|\/images\/core\/emoji\//i], js: { twemoji: true } },

    // ── Analytics ────────────────────────────────────────────────────────
    { id: 'ga', name: 'Google Analytics', cat: 'analytics',
      src: [/googletagmanager\.com\/gtag\/js/, /google-analytics\.com\/(?:analytics|ga)\.js/],
      js: { gtag: true, GoogleAnalyticsObject: true },
      ids: [/\bG-[A-Z0-9]{8,12}\b/g, /\bUA-\d{4,10}-\d{1,4}\b/g] },
    { id: 'hotjar', name: 'Hotjar', cat: 'analytics', js: { hj: true },
      src: [host('static.hotjar.com', 'script.hotjar.com')], ids: [/hjid\s*[:=]\s*(\d{5,10})/g] },
    { id: 'clarity', name: 'Microsoft Clarity', cat: 'analytics', js: { clarity: true },
      src: [/clarity\.ms\/tag\//], ids: [/clarity\.ms\/tag\/([a-z0-9]{8,12})/g] },
    { id: 'crazyegg', name: 'Crazy Egg', cat: 'analytics', src: [host('crazyegg.com')], js: { CE2: true } },
    { id: 'plausible', name: 'Plausible', cat: 'analytics', js: { plausible: true },
      src: [/plausible\.io\/js/], dom: [weak('script[data-domain][src*="script"]')] },
    { id: 'fathom', name: 'Fathom', cat: 'analytics', src: [host('cdn.usefathom.com')], js: { fathom: true } },
    { id: 'umami', name: 'Umami', cat: 'analytics', js: { umami: true }, dom: [weak('script[data-website-id]')] },
    { id: 'simpleanalytics', name: 'Simple Analytics', cat: 'analytics', src: [host('scripts.simpleanalyticscdn.com')] },
    { id: 'matomo', name: 'Matomo', cat: 'analytics', js: { _paq: true, Matomo: true, Piwik: true }, src: [/matomo\.js|piwik\.js/] },
    { id: 'mixpanel', name: 'Mixpanel', cat: 'analytics', js: { mixpanel: true }, src: [host('cdn.mxpnl.com')] },
    { id: 'amplitude', name: 'Amplitude', cat: 'analytics', js: { amplitude: true }, src: [host('cdn.amplitude.com')] },
    { id: 'segment', name: 'Segment', cat: 'analytics', js: { 'analytics.SNIPPET_VERSION': 'analytics.VERSION' }, src: [host('cdn.segment.com')] },
    { id: 'posthog', name: 'PostHog', cat: 'analytics', js: { posthog: true }, src: [host('posthog.com')], bundle: [/posthog-js/] },
    { id: 'heap', name: 'Heap', cat: 'analytics', src: [host('cdn.heapanalytics.com')] },
    { id: 'fullstory', name: 'FullStory', cat: 'analytics', js: { _fs_namespace: true }, src: [host('fullstory.com')] },
    { id: 'vercel-analytics', name: 'Vercel Web Analytics', cat: 'analytics', src: [/\/_vercel\/insights\//] },
    { id: 'vercel-speed', name: 'Vercel Speed Insights', cat: 'monitoring', src: [/\/_vercel\/speed-insights\//] },
    { id: 'cf-analytics', name: 'Cloudflare Web Analytics', cat: 'analytics',
      src: [host('static.cloudflareinsights.com')], dom: ['script[data-cf-beacon]'] },

    // ── Monitoring ───────────────────────────────────────────────────────
    { id: 'sentry', name: 'Sentry', cat: 'monitoring', js: { __SENTRY__: true, Sentry: 'Sentry.SDK_VERSION' }, bundle: [/sentry\.javascript\.(?:browser|react|nextjs|vue)/],
      src: [host('sentry-cdn.com', 'sentry.io')] },
    { id: 'logrocket', name: 'LogRocket', cat: 'monitoring', js: { LogRocket: true }, src: [host('cdn.logrocket.io', 'cdn.lr-ingest.io')] },
    { id: 'newrelic', name: 'New Relic', cat: 'monitoring', js: { NREUM: true }, src: [host('js-agent.newrelic.com', 'nr-data.net')] },
    { id: 'datadog', name: 'Datadog RUM', cat: 'monitoring', js: { DD_RUM: 'DD_RUM.version' }, src: [host('datadoghq-browser-agent.com')] },
    { id: 'bugsnag', name: 'Bugsnag', cat: 'monitoring', js: { Bugsnag: true }, src: [host('bugsnag.com')] },
    { id: 'speedcurve', name: 'SpeedCurve', cat: 'monitoring', js: { LUX: true } },

    // ── Marketing & tags ─────────────────────────────────────────────────
    { id: 'gtm', name: 'Google Tag Manager', cat: 'marketing',
      src: [/googletagmanager\.com\/gtm\.js/], js: { google_tag_manager: true }, ids: [/\bGTM-[A-Z0-9]{5,9}\b/g] },
    { id: 'google-ads', name: 'Google Ads', cat: 'marketing',
      src: [host('googleadservices.com', 'googlesyndication.com', 'doubleclick.net')], ids: [/\bAW-\d{6,12}\b/g] },
    { id: 'meta-pixel', name: 'Meta Pixel', cat: 'marketing', js: { fbq: true },
      src: [/connect\.facebook\.net\/[^/]+\/fbevents\.js/], ids: [/fbq\(\s*['"]init['"]\s*,\s*['"](\d{8,20})/g] },
    { id: 'linkedin-insight', name: 'LinkedIn Insight', cat: 'marketing',
      js: { _linkedin_partner_id: true }, src: [host('snap.licdn.com', 'px.ads.linkedin.com')] },
    { id: 'tiktok-pixel', name: 'TikTok Pixel', cat: 'marketing', js: { ttq: true }, src: [host('analytics.tiktok.com')] },
    { id: 'x-pixel', name: 'X (Twitter) Pixel', cat: 'marketing', js: { twq: true }, src: [host('static.ads-twitter.com')] },
    { id: 'pinterest-tag', name: 'Pinterest Tag', cat: 'marketing', js: { pintrk: true }, src: [/pinimg\.com\/ct\/core\.js/] },
    { id: 'reddit-pixel', name: 'Reddit Pixel', cat: 'marketing', js: { rdt: true }, src: [/redditstatic\.com\/ads\/pixel\.js/] },
    { id: 'bing-uet', name: 'Microsoft Advertising UET', cat: 'marketing', js: { uetq: true }, src: [host('bat.bing.com')] },
    { id: 'hubspot', name: 'HubSpot', cat: 'marketing', js: { _hsq: true, HubSpotConversations: true },
      src: [host('hs-scripts.com', 'hs-analytics.net', 'hsforms.net', 'hscollectedforms.net', 'hs-banner.com')] },
    { id: 'marketo', name: 'Marketo', cat: 'marketing', js: { Munchkin: true, MktoForms2: true }, src: [host('marketo.net', 'mktoresp.com')] },
    { id: 'pardot', name: 'Salesforce Pardot', cat: 'marketing', js: { piAId: true }, src: [host('pardot.com')] },
    { id: 'mailchimp', name: 'Mailchimp', cat: 'marketing',
      src: [host('chimpstatic.com', 'list-manage.com')], dom: ['#mc_embed_signup', 'form[action*="list-manage.com"]'] },
    { id: 'klaviyo', name: 'Klaviyo', cat: 'marketing', js: { klaviyo: true, _learnq: true }, src: [host('klaviyo.com')] },
    { id: 'convertkit', name: 'Kit (ConvertKit)', cat: 'marketing', src: [host('convertkit.com', 'ck.page')] },
    { id: 'activecampaign', name: 'ActiveCampaign', cat: 'marketing', src: [host('activehosted.com', 'trackcmp.net')] },
    { id: 'optimizely', name: 'Optimizely', cat: 'marketing', js: { optimizely: true }, src: [host('optimizely.com')] },
    { id: 'vwo', name: 'VWO', cat: 'marketing', js: { _vwo_code: true, VWO: true }, src: [host('visualwebsiteoptimizer.com')] },

    // ── Widgets & embeds ─────────────────────────────────────────────────
    { id: 'intercom', name: 'Intercom', cat: 'widgets', js: { Intercom: true }, src: [host('widget.intercom.io', 'intercomcdn.com')] },
    { id: 'drift', name: 'Drift', cat: 'widgets', js: { drift: true }, src: [host('js.driftt.com')] },
    { id: 'crisp', name: 'Crisp', cat: 'widgets', js: { $crisp: true }, src: [host('client.crisp.chat')] },
    { id: 'zendesk', name: 'Zendesk', cat: 'widgets', js: { zE: true }, src: [host('static.zdassets.com')] },
    { id: 'tawk', name: 'Tawk.to', cat: 'widgets', js: { Tawk_API: true }, src: [host('embed.tawk.to')] },
    { id: 'helpscout', name: 'Help Scout Beacon', cat: 'widgets', js: { Beacon: true }, src: [host('beacon-v2.helpscout.net')] },
    { id: 'livechat', name: 'LiveChat', cat: 'widgets', js: { LiveChatWidget: true }, src: [host('cdn.livechatinc.com')] },
    { id: 'tidio', name: 'Tidio', cat: 'widgets', src: [host('code.tidio.co')] },
    { id: 'calendly', name: 'Calendly', cat: 'widgets', js: { Calendly: true }, src: [host('assets.calendly.com')], dom: ['.calendly-inline-widget'] },
    { id: 'typeform', name: 'Typeform', cat: 'widgets', src: [host('embed.typeform.com')], dom: ['[data-tf-widget],[data-tf-live]'] },
    { id: 'jotform', name: 'Jotform', cat: 'widgets', src: [host('jotfor.ms', 'jotform.com')] },
    { id: 'youtube', name: 'YouTube', cat: 'widgets',
      src: [/youtube(?:-nocookie)?\.com\/(?:embed|iframe_api)|ytimg\.com/], dom: ['lite-youtube'] },
    { id: 'vimeo', name: 'Vimeo', cat: 'widgets', src: [host('player.vimeo.com', 'vimeocdn.com')] },
    { id: 'wistia', name: 'Wistia', cat: 'widgets', src: [host('fast.wistia.com', 'fast.wistia.net')] },
    { id: 'google-maps', name: 'Google Maps', cat: 'widgets',
      src: [/maps\.googleapis\.com\/maps\/api\/js|google\.com\/maps\/embed/], js: { 'google.maps': 'google.maps.version' } },
    { id: 'mapbox', name: 'Mapbox', cat: 'widgets', js: { mapboxgl: 'mapboxgl.version' }, src: [host('api.mapbox.com')] },
    { id: 'leaflet', name: 'Leaflet', cat: 'widgets', js: { 'L.map': 'L.version' }, dom: ['.leaflet-container'] },
    { id: 'algolia', name: 'Algolia', cat: 'widgets', js: { algoliasearch: true }, src: [host('algolia.net', 'algolianet.com', 'algolia.io')] },
    { id: 'disqus', name: 'Disqus', cat: 'widgets', js: { DISQUS: true }, src: [host('disqus.com')] },
    { id: 'trustpilot', name: 'Trustpilot', cat: 'widgets', src: [host('widget.trustpilot.com')] },
    { id: 'elfsight', name: 'Elfsight', cat: 'widgets', src: [host('elfsightcdn.com', 'apps.elfsight.com')] },
    { id: 'addthis', name: 'AddThis / ShareThis', cat: 'widgets', src: [host('addthis.com', 'sharethis.com')] },

    // ── Privacy & security ───────────────────────────────────────────────
    { id: 'recaptcha', name: 'reCAPTCHA', cat: 'privacy',
      src: [/google\.com\/recaptcha|gstatic\.com\/recaptcha|recaptcha\.net/], js: { grecaptcha: true },
      tags: [{ tag: 'v3', src: /recaptcha\/api\.js\?[^#]*render=(?!explicit)/ }] },
    { id: 'hcaptcha', name: 'hCaptcha', cat: 'privacy', src: [host('hcaptcha.com')], js: { hcaptcha: true } },
    { id: 'turnstile', name: 'Cloudflare Turnstile', cat: 'privacy', src: [/challenges\.cloudflare\.com\/turnstile/], js: { turnstile: true } },
    { id: 'onetrust', name: 'OneTrust', cat: 'privacy', js: { OneTrust: true, OptanonWrapper: true }, src: [host('cookielaw.org', 'onetrust.com')] },
    { id: 'cookiebot', name: 'Cookiebot', cat: 'privacy', js: { Cookiebot: true }, src: [host('consent.cookiebot.com', 'consent.cookiebot.eu')] },
    { id: 'termly', name: 'Termly', cat: 'privacy', src: [host('app.termly.io')] },
    { id: 'osano', name: 'Osano', cat: 'privacy', js: { Osano: true }, src: [host('osano.com')] },
    { id: 'iubenda', name: 'iubenda', cat: 'privacy', src: [host('iubenda.com')] },
    { id: 'usercentrics', name: 'Usercentrics', cat: 'privacy', js: { UC_UI: true }, src: [host('usercentrics.eu')] },
    { id: 'cookieyes-cdn', name: 'CookieYes', cat: 'privacy', src: [host('cookieyes.com')] },

    // ── Server & runtime ─────────────────────────────────────────────────
    { id: 'php', name: 'PHP', cat: 'server', headers: { 'x-powered-by': /PHP\/?([\d.]+)?/i }, cookies: [/^PHPSESSID$/] },
    { id: 'mysql', name: 'MySQL / MariaDB', cat: 'server' },
    { id: 'node', name: 'Node.js', cat: 'server' },
    { id: 'python', name: 'Python', cat: 'server' },
    { id: 'ruby', name: 'Ruby', cat: 'server' },
    { id: 'java', name: 'Java', cat: 'server', cookies: [/^JSESSIONID$/] },
    { id: 'express', name: 'Express', cat: 'server', implies: ['node'], headers: { 'x-powered-by': /^Express$/i } },
    { id: 'nginx', name: 'Nginx', cat: 'server', headers: { server: /nginx(?:\/([\d.]+))?/i } },
    { id: 'apache', name: 'Apache', cat: 'server', headers: { server: /Apache(?:\/([\d.]+))?/i } },
    { id: 'litespeed', name: 'LiteSpeed', cat: 'server', headers: { server: /LiteSpeed/i } },
    { id: 'iis', name: 'Microsoft IIS', cat: 'server', headers: { server: /Microsoft-IIS(?:\/([\d.]+))?/i } },
    { id: 'openresty', name: 'OpenResty', cat: 'server', headers: { server: /openresty(?:\/([\d.]+))?/i } },
    { id: 'caddy', name: 'Caddy', cat: 'server', headers: { server: /Caddy/i } },
    { id: 'gunicorn', name: 'Gunicorn', cat: 'server', implies: ['python'], headers: { server: /gunicorn(?:\/([\d.]+))?/i } },
    { id: 'varnish', name: 'Varnish', cat: 'server', headers: { 'x-varnish': /./, via: /varnish/i } },
    { id: 'laravel', name: 'Laravel', cat: 'server', implies: ['php'], cookies: [/^laravel_session$/, weak(/^XSRF-TOKEN$/)] },
    { id: 'yii', name: 'Yii', cat: 'server', implies: ['php'], cookies: [/^YII_CSRF_TOKEN$/] },
    { id: 'django', name: 'Django', cat: 'server', implies: ['python'],
      cookies: [weak(/^csrftoken$/), /^django_language$/], html: [/name=["']csrfmiddlewaretoken["']/] },
    { id: 'rails', name: 'Ruby on Rails', cat: 'server', implies: ['ruby'],
      meta: { 'csrf-param': /^authenticity_token$/ }, headers: { 'x-runtime': weak(/^[\d.]+$/) } },
    { id: 'aspnet', name: 'ASP.NET', cat: 'server',
      headers: { 'x-powered-by': /ASP\.NET/i, 'x-aspnet-version': /([\d.]+)/, server: /Kestrel/i },
      cookies: [/^ASP\.NET_SessionId$/, /^\.AspNetCore\./], html: [/__VIEWSTATE/] },
    { id: 'graphql', name: 'GraphQL API', cat: 'server', src: [weak(/\/graphql(?:[?#]|$)/i)] },

    // ── Hosting & CDN ────────────────────────────────────────────────────
    { id: 'vercel', name: 'Vercel', cat: 'hosting', headers: { server: /^Vercel$/i, 'x-vercel-id': /./, 'x-vercel-cache': /./ },
      tags: [{ tag: 'edge cache HIT', header: ['x-vercel-cache', /HIT/] }] },
    { id: 'vercel-botid', name: 'Vercel BotID', cat: 'privacy', src: [/\/a-4-a\/c\.js/], bundle: [/\/a-4-a\/c\.js|botid\/client|"botid"/] },
    { id: 'envoy', name: 'Envoy', cat: 'server', headers: { server: /^envoy$/i, 'x-envoy-upstream-service-time': /./ } },
    { id: 'netlify', name: 'Netlify', cat: 'hosting', headers: { server: /Netlify/i, 'x-nf-request-id': /./ } },
    { id: 'cloudflare', name: 'Cloudflare', cat: 'hosting', headers: { server: /^cloudflare$/i, 'cf-ray': /./, 'cf-cache-status': /./ },
      src: [/\/cdn-cgi\//] },
    { id: 'cf-email', name: 'Cloudflare Email Obfuscation', cat: 'privacy', src: [/\/cdn-cgi\/scripts\/[^/]+\/cloudflare-static\/email-decode/] },
    { id: 'cf-rocket', name: 'Cloudflare Rocket Loader', cat: 'hosting', src: [/\/cdn-cgi\/scripts\/[^/]+\/cloudflare-static\/rocket-loader/] },
    { id: 'fastly', name: 'Fastly', cat: 'hosting', headers: { 'x-fastly-request-id': /./, 'x-served-by': /cache-[a-z0-9]+-[A-Z]{3}/ } },
    { id: 'akamai', name: 'Akamai', cat: 'hosting', headers: { 'x-akamai-transformed': /./, server: /AkamaiGHost|AkamaiNetStorage/i, 'akamai-grn': /./ } },
    { id: 'cloudfront', name: 'Amazon CloudFront', cat: 'hosting', headers: { 'x-amz-cf-id': /./, via: /CloudFront/i } },
    { id: 's3', name: 'Amazon S3', cat: 'hosting', headers: { server: /AmazonS3/i } },
    { id: 'github-pages', name: 'GitHub Pages', cat: 'hosting', headers: { server: /GitHub\.com/i } },
    { id: 'render', name: 'Render', cat: 'hosting', headers: { 'x-render-origin-server': /./, 'rndr-id': /./ } },
    { id: 'fly', name: 'Fly.io', cat: 'hosting', headers: { 'fly-request-id': /./, server: /^Fly\//i } },
    { id: 'heroku', name: 'Heroku', cat: 'hosting', headers: { via: /vegur/i } },
    { id: 'wpengine', name: 'WP Engine', cat: 'hosting', headers: { 'x-powered-by': /WP Engine/i, 'wpe-backend': /./ }, src: [host('wpenginepowered.com')] },
    { id: 'kinsta', name: 'Kinsta', cat: 'hosting', headers: { 'x-kinsta-cache': /./ } },
    { id: 'pantheon', name: 'Pantheon', cat: 'hosting', headers: { 'x-pantheon-styx-hostname': /./, 'x-styx-req-id': /./ } },
    { id: 'acquia', name: 'Acquia', cat: 'hosting', headers: { 'x-ah-environment': /./ } },
    { id: 'wpcom', name: 'WordPress.com / VIP', cat: 'hosting', headers: { 'x-hacker': /automattic|a8c/i } },
    { id: 'plesk', name: 'Plesk', cat: 'hosting', headers: { 'x-powered-by': /Plesk(?:Lin|Win)/i } },
    { id: 'azure', name: 'Azure Front Door', cat: 'hosting', headers: { 'x-azure-ref': /./, 'x-msedge-ref': /./ } },
    { id: 'gcp', name: 'Google Cloud', cat: 'hosting', headers: { server: /Google Frontend/i } },
    { id: 'bunny', name: 'bunny.net', cat: 'hosting', headers: { server: /BunnyCDN/i, 'cdn-pullzone': /./ }, src: [host('b-cdn.net')] },
    { id: 'jsdelivr', name: 'jsDelivr', cat: 'hosting', src: [host('cdn.jsdelivr.net')] },
    { id: 'unpkg', name: 'unpkg', cat: 'hosting', src: [host('unpkg.com')] },
    { id: 'cdnjs', name: 'cdnjs', cat: 'hosting', src: [host('cdnjs.cloudflare.com')] },
    { id: 'google-cdn', name: 'Google Hosted Libraries', cat: 'hosting', src: [host('ajax.googleapis.com')] },

    // ── Build & generators ───────────────────────────────────────────────
    { id: 'vite', name: 'Vite', cat: 'build',
      src: [/\/@vite\/client/, weak(/\/assets\/[\w.-]+-[\w-]{8}\.(?:js|css)(?:[?#]|$)/)],
      bundle: [/__vite__mapDeps|vite\/modulepreload-polyfill|__vite_ssr_/],
      tags: [{ tag: 'dev server', src: /\/@vite\/client/ }] },
    { id: 'webpack', name: 'webpack', cat: 'build', js: { '@webpack': true }, bundle: [/__webpack_require__/] },
    { id: 'metro', name: 'Metro bundler', cat: 'build', src: [/__expo-metro-runtime/], bundle: [/__METRO_GLOBAL_PREFIX__|__d\(function\(g,r,i,a,m,e,d\)/] },
    { id: 'turbopack', name: 'Turbopack', cat: 'build', bundle: [/TURBOPACK|__turbopack_load__/] },
    { id: 'babel', name: 'Babel (down-leveled output)', cat: 'build', bundle: [weak(/regeneratorRuntime|_classCallCheck|@babel\/runtime/)] },
    { id: 'parcel', name: 'Parcel', cat: 'build', js: { parcelRequire: true } },
    { id: 'hugo', name: 'Hugo', cat: 'build', meta: { generator: /Hugo\s*([\d.]+)/i } },
    { id: 'jekyll', name: 'Jekyll', cat: 'build', meta: { generator: /Jekyll\s*v?([\d.]+)/i } },
    { id: 'eleventy', name: 'Eleventy', cat: 'build', meta: { generator: /Eleventy\s*v?([\d.]+)/i } },
    { id: 'docusaurus', name: 'Docusaurus', cat: 'build', meta: { generator: /Docusaurus\s*v?([\d.]+)/i } },
    { id: 'vitepress', name: 'VitePress', cat: 'build', meta: { generator: /VitePress\s*v?([\d.]+)/i } },
    { id: 'hexo', name: 'Hexo', cat: 'build', meta: { generator: /Hexo\s*([\d.]+)?/i } },
    { id: 'mkdocs', name: 'MkDocs', cat: 'build', meta: { generator: /mkdocs-([\d.]+)/i } },

    // ── Misc ─────────────────────────────────────────────────────────────
    { id: 'schema', name: 'Schema.org', cat: 'misc', custom: 'schema' },
    { id: 'open-graph', name: 'Open Graph', cat: 'misc', dom: ['meta[property^="og:"]'] },
    { id: 'twitter-cards', name: 'X / Twitter Cards', cat: 'misc', dom: ['meta[name="twitter:card"]'] },
    { id: 'pwa', name: 'Web app manifest', cat: 'misc', dom: ['link[rel="manifest"]'] },
    { id: 'rss', name: 'RSS / Atom feed', cat: 'misc', dom: ['link[type="application/rss+xml"],link[type="application/atom+xml"]'] },
    { id: 'amp', name: 'AMP', cat: 'misc', dom: ['html[amp]', 'link[rel="amphtml"]'] },
    { id: 'hreflang', name: 'hreflang alternates', cat: 'misc', dom: ['link[rel="alternate"][hreflang]'] },
  ];

  // ── WordPress plugins ─────────────────────────────────────────────────
  // Any folder under /wp-content/plugins/ is detected automatically; these entries
  // add proper names plus DOM/HTML fingerprints that work even when assets are
  // combined or minified away by a cache plugin.
  const wp = (slugs, name, extra = {}) => {
    slugs = [].concat(slugs);
    RULES.push({ id: 'wp:' + slugs[0], name, cat: 'plugins', wpSlug: slugs, ...extra });
  };
  wp('gravityforms', 'Gravity Forms', { dom: ['.gform_wrapper', 'form[id^="gform_"]'], js: { gform: true } });
  wp(['wordpress-seo', 'wordpress-seo-premium'], 'Yoast SEO', {
    html: [/optimized with the Yoast SEO(?: Premium)? plugin v?([\d.]+)/i], dom: ['script.yoast-schema-graph'] });
  wp('wp-rocket', 'WP Rocket', {
    meta: { generator: /WP Rocket\s*([\d.]+)/i },
    html: [/<!-- This website is like a Rocket/i],
    src: [/\/wp-content\/cache\/(?:min|busting|critical-css)\//],
    dom: ['script[data-rocket-src]', '[data-rocket-lazy-bg]', 'link[data-rocket-prefetch]', '[data-wpr-lazyrender]'],
    js: { RocketLazyLoadScripts: true } });
  wp(['advanced-custom-fields-pro', 'advanced-custom-fields', 'secure-custom-fields'], 'Advanced Custom Fields', {
    dom: [weak('[class*="wp-block-acf-"]')] });
  wp(['elementor', 'elementor-pro'], 'Elementor', {
    dom: ['[data-elementor-type]', '.elementor'], js: { elementorFrontend: 'elementorFrontendConfig.version' },
    meta: { generator: /Elementor\s*([\d.]+)/i } });
  wp('contact-form-7', 'Contact Form 7', { dom: ['.wpcf7'], js: { wpcf7: true } });
  wp(['wpforms-lite', 'wpforms'], 'WPForms', { dom: ['.wpforms-container'] });
  wp('ninja-forms', 'Ninja Forms', { dom: ['.nf-form-cont'] });
  wp('formidable', 'Formidable Forms', { dom: ['.frm_forms'] });
  wp('fluentform', 'Fluent Forms', { dom: ['.fluentform'] });
  wp('woocommerce', 'WooCommerce', {
    cat: 'commerce', dom: ['body.woocommerce', '.woocommerce'],
    meta: { generator: /WooCommerce\s*([\d.]+)/i }, js: { woocommerce_params: true, wc_add_to_cart_params: true } });
  wp('jetpack', 'Jetpack', { src: [host('stats.wp.com', 'c0.wp.com')] });
  wp('wordfence', 'Wordfence');
  wp('akismet', 'Akismet');
  wp('w3-total-cache', 'W3 Total Cache', { html: [/Performance optimized by W3 Total Cache/i] });
  wp('wp-super-cache', 'WP Super Cache', { html: [/generated by WP-Super-Cache/i] });
  wp('wp-fastest-cache', 'WP Fastest Cache', { html: [/WP Fastest Cache file was created/i] });
  wp('litespeed-cache', 'LiteSpeed Cache', {
    html: [/Page generated by LiteSpeed Cache\s*([\d.]+)?/i], headers: { 'x-litespeed-cache': /./ } });
  wp('autoptimize', 'Autoptimize', { src: [/\/wp-content\/cache\/autoptimize\//] });
  wp('ewww-image-optimizer', 'EWWW Image Optimizer', { js: { ewww_webp_supported: true } });
  wp('wp-smushit', 'Smush');
  wp(['complianz-gdpr', 'complianz-gdpr-premium'], 'Complianz', { dom: ['#cmplz-cookiebanner-container', '.cmplz-cookiebanner'] });
  wp('cookie-law-info', 'CookieYes (GDPR Cookie Consent)');
  wp('seo-by-rank-math', 'Rank Math', { html: [/Search Engine Optimization by Rank Math/i] });
  wp('all-in-one-seo-pack', 'All in One SEO', { html: [/All in One SEO(?: Pro)? ([\d.]+)/i] });
  wp('sitepress-multilingual-cms', 'WPML', { meta: { generator: /WPML ver:([\d.]+)/i } });
  wp('polylang', 'Polylang');
  wp('the-events-calendar', 'The Events Calendar', { dom: ['.tribe-events'] });
  wp(['bb-plugin', 'beaver-builder-lite-version'], 'Beaver Builder', { dom: ['.fl-builder-content'] });
  wp('js_composer', 'WPBakery', { dom: ['.vc_row'] });
  wp('kadence-blocks', 'Kadence Blocks');
  wp('ultimate-addons-for-gutenberg', 'Spectra');
  wp('generateblocks', 'GenerateBlocks');
  wp('revslider', 'Slider Revolution', { dom: ['rs-module', '.rev_slider'] });
  wp('facetwp', 'FacetWP', { js: { FWP: true } });
  wp('searchwp', 'SearchWP');
  wp('relevanssi', 'Relevanssi');
  wp('mailchimp-for-wp', 'MC4WP', { dom: ['.mc4wp-form'] });
  wp('google-analytics-for-wordpress', 'MonsterInsights');
  wp('google-site-kit', 'Site Kit by Google', { meta: { generator: /Site Kit by Google\s*([\d.]+)/i } });
  wp('wp-optimize', 'WP-Optimize');
  wp('perfmatters', 'Perfmatters');
  wp('redirection', 'Redirection');
  wp('safe-svg', 'Safe SVG');
  wp('svg-support', 'SVG Support');
  wp('imagify', 'Imagify');
  wp('shortpixel-image-optimiser', 'ShortPixel');
  wp('real-cookie-banner', 'Real Cookie Banner');
  wp('give', 'GiveWP');
  wp('sfwd-lms', 'LearnDash');
  wp('memberpress', 'MemberPress');
  wp('buddypress', 'BuddyPress');
  wp('bbpress', 'bbPress');
  wp('gutenberg', 'Gutenberg (plugin)');
  wp('popup-maker', 'Popup Maker');
  wp('ultimate-member', 'Ultimate Member');
  wp('duplicate-post', 'Yoast Duplicate Post');
  wp('duracelltomi-google-tag-manager', 'GTM4WP');
  wp('cookie-notice', 'Cookie Notice');
  wp('instagram-feed', 'Smash Balloon Instagram Feed');
  wp('custom-facebook-feed', 'Smash Balloon Facebook Feed');
  wp('tablepress', 'TablePress', { dom: ['.tablepress'] });
  wp('jetpack-boost', 'Jetpack Boost');
  wp('query-monitor', 'Query Monitor');
  wp('sg-cachepress', 'SiteGround Optimizer');
  wp('breeze', 'Breeze');
  wp('wp-graphql', 'WPGraphQL');
  wp('custom-post-type-ui', 'Custom Post Type UI');
  wp('updraftplus', 'UpdraftPlus');
  wp('all-in-one-wp-migration', 'All-in-One WP Migration');
  wp('better-wp-security', 'Solid Security');
  wp('sucuri-scanner', 'Sucuri Security');
  wp('wp-mail-smtp', 'WP Mail SMTP');
  wp('classic-editor', 'Classic Editor');
  wp('wps-hide-login', 'WPS Hide Login');
  wp('cloudflare', 'Cloudflare (plugin)');
  wp('nitropack', 'NitroPack');
  wp('flying-press', 'FlyingPress');
  wp('wp-store-locator', 'WP Store Locator');
  wp('ajax-search-pro', 'Ajax Search Pro');
  wp('megamenu', 'Max Mega Menu');

  // ── Craft CMS plugins (Craft serves plugin assets from /cpresources/, so we fingerprint markup) ──
  RULES.push(
    { id: 'craft:formie', name: 'Formie', cat: 'plugins', note: 'Craft CMS plugin', dom: ['.fui-form', '[data-fui-form]'] },
    { id: 'craft:freeform', name: 'Freeform', cat: 'plugins', note: 'Craft CMS plugin', dom: ['form[data-freeform]', '[data-freeform-form]'] },
    { id: 'craft:blitz', name: 'Blitz', cat: 'plugins', note: 'Craft CMS plugin', html: [/Cached by Blitz/i], headers: { 'x-blitz': /./ } },
    { id: 'craft:seomatic', name: 'SEOmatic', cat: 'plugins', note: 'Craft CMS plugin', html: [/SEOmatic/] },
  );

  const WP_SLUGS = new Map();
  for (const r of RULES) for (const s of r.wpSlug || []) WP_SLUGS.set(s.toLowerCase(), r);

  globalThis.DEETZ_RULES = { RULES, CATEGORIES, WP_SLUGS };
})();
