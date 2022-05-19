module.exports = {
    head:[[
        'script', {}, `
        var _hmt = _hmt || [];
            (function() {
            var hm = document.createElement("script");
            hm.src = "https://hm.baidu.com/hm.js?8e5d763e94778d1db7f6a7963b45400d";
            var s = document.getElementsByTagName("script")[0]; 
            s.parentNode.insertBefore(hm, s);
            })();
        `,
        'link', { rel: 'icon', href: '/favicon.ico' }
      ]],
    title: "jaychen's stroy",
    theme: 'reco',
    themeConfig: {
        logo:  '/images/avatar.jpg',

        authorAvatar: '/images/avatar.jpg',
        author: 'jaychen',
        type:'blog',
        startYear: '2022',
        lastUpdated: 'Last Updated', // string | boolean
        blogConfig: {
            category: {
                location: 2,     // 在导航栏菜单中所占的位置，默认2
                text: 'Category' // 默认文案 “分类”
            }
        },
        subSidebar: 'auto',
        nav: [
            { text: '首页', link: '/' ,icon:'reco-home'},
            { text: 'sidergo 系列教程', link: 'https://sidergo.jaychen.fun' ,icon:'reco-document'},

            { text: '时间线', link: '/timeline/', icon: 'reco-date' },
            {
                text: 'Github', link: 'https://github.com/chenjiayao',icon:'reco-github'
            }
        ]
    }
}  