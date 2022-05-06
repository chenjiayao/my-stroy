module.exports = {
    theme: 'reco',
    themeConfig: {
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

            { text: '时间线', link: '/timeline/', icon: 'reco-date' },
            {
                text: 'Github', link: 'https://github.com/chenjiayao'
            }
        ]
    }
}  