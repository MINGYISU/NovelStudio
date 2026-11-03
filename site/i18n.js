// English text lives in index.html (so the page reads fine without JavaScript).
// This file holds the Simplified Chinese strings, keyed by data-i18n, plus the
// strings that main.js builds at runtime in both languages.

export const zh = {
  skip: '跳到正文',
  close: '关闭',
  copy: '复制',
  'nav.label': '章节导航',
  'nav.try': '试一试',
  'nav.tour': '功能巡礼',
  'nav.safety': '数据安全',
  'nav.start': '开始使用',
  'ctl.lang': '语言',
  'ctl.theme': '主题',
  'ctl.paper': '纸白',
  'ctl.sepia': '暖黄',
  'ctl.night': '夜间',
  'ctl.github': 'GitHub 仓库',

  'hero.eyebrow': '本地优先 · 无需账号 · 永久免费',
  'hero.h1a': '你的小说，从第一行到',
  'hero.h1b': '终章',
  'hero.lede':
    'NovelStudio 是一间安静的长篇小说写作工作室。把章节拖到新的位置，所有编号自动跟随。用故事地图梳理情节，追踪每一条伏笔直到回收，再用四层备份守护你的文字。',
  'hero.cta1': '开始使用',
  'hero.cta2': '试试拖动章节 ↓',
  'hero.b1': 'MIT 开源协议',
  'hero.b2': '离线可用',
  'hero.b3': '英文 & 简体中文界面',
  'hero.b4': '数据是朴素的 JSON',
  'hero.alt': 'NovelStudio 稿件工作区：左侧是章节列表，中间是正文，右侧是章节详情。',
  'hero.chipSaved': '已保存',
  'hero.chipMove': '第四章 → 第三章',
  'hero.chipStar': '★ 第三章回收伏笔',

  'strip.label': '设计原则',
  'strip.1': '只监听 127.0.0.1',
  'strip.2': '无需账号',
  'strip.3': '无任何遥测',
  'strip.4': '不加载外部字体或脚本',
  'strip.5': '可直接阅读的冷备份',
  'strip.6': '固定 ID，链接永不失效',
  'strip.7': '编号自动计算，从不手填',

  'try.eyebrow': '这个应用存在的理由',
  'try.h2': '移动一章，一切自动跟上。',
  'try.p':
    '在 NovelStudio 里，章节编号由顺序计算得出，从不写进标题。拖动手柄即可调整章节（也可聚焦手柄后按 <kbd>Alt</kbd> + <kbd>↑</kbd>/<kbd>↓</kbd>）。试试把回收放到埋设之前。',
  'try.manuscript': '稿件',
  'try.styleLabel': '编号样式',
  'try.listLabel': '章节',
  'try.reset': '重置',
  'try.foreshadowing': '伏笔',
  'try.setup': '埋设',
  'try.hint': '暗示',
  'try.payoff': '回收',
  'try.note':
    '这只是真实功能的简化模型。在应用中，同样的规则会在服务器和浏览器两端同时执行，不合理的移动（例如把“部”放进它自己的章里）会被拒绝。',

  'tour.eyebrow': '工作室巡礼',
  'tour.h2': '长篇所需的一切，不多也不少。',
  'tour.p':
    '以下是真实应用的真实截图，示例小说是虚构的《灯塔之路》（The Lantern Road）。点击标签切换，点击图片可放大。',
  'tour.tabs': '功能',
  'tour.zoom': '放大截图',
  'tour.shot': '截图',
  'tour.library.t': '书库',
  'tour.library.s': '每本书都有一个书架位',
  'tour.manuscript.t': '稿件',
  'tour.manuscript.s': '在中间安心写作',
  'tour.pictures.t': '插图',
  'tour.pictures.s': '段落之间放图片',
  'tour.maps.t': '故事地图',
  'tour.maps.s': '把情节画成图',
  'tour.fs.t': '伏笔',
  'tour.fs.s': '埋设、暗示、回收',
  'tour.codex.t': '设定集',
  'tour.codex.s': '人物与世界观',

  'bento.eyebrow': '为长篇而生',
  'bento.h2': '写到第 80 章，才知道细节有多重要',
  'bento.num.h': '两套编号，一键切换',
  'bento.num.p':
    '“Chapter 3”或“第三章”。卷、部、章、场景各有自己的格式和重新计数规则。序章、间章永远不占编号。',
  'bento.anchor.h': '伏笔锚定在文字上',
  'bento.anchor.p': '选中一句话，标记为埋设、暗示或回收。剪切后粘贴到另一章，伏笔会跟着一起走。',
  'bento.anchor.s1': '封蜡之下，有人画了一只小小的',
  'bento.anchor.s2': '银蛾',
  'bento.anchor.tag': '● 埋设',
  'bento.look.h': '让页面成为你的样子',
  'bento.look.p':
    '字体、字号、行距、首行缩进、版心宽度，还有浅色、深色和暖黄主题。在本页就能试一试。',
  'bento.io.h': '稿件导入，随时导出',
  'bento.io.p':
    '导入 <code>.txt</code> 或 <code>.md</code>（UTF-8，或较旧的 GB18030 中文文件），先预览识别出的章节，确认后才会创建。随时导出 Markdown 或纯文本。',
  'bento.lang.h': 'English 或简体中文',
  'bento.lang.p': '随时切换界面语言。你选择的语言绝不会改动书稿本身。',
  'bento.local.h': '你的电脑，你说了算',
  'bento.local.p': '一个只监听 127.0.0.1 的小型服务。没有账号，没有遥测，也不检查更新。',
  'bento.ids.h': '链接永不断裂',
  'bento.ids.p':
    '地图、伏笔和笔记指向的是章节的永久 ID，而不是标题、编号或位置，所以改名、调序都不会留下失效的链接。',

  'safe.eyebrow': '数据安全，永远第一',
  'safe.h2': '四层防线，守住每一章',
  'safe.p': '选一种意外，看看由哪一层接住你。',
  'safe.scLabel': '意外情形',
  'safe.sc0': '写到一半不小心关了标签页',
  'safe.sc1': '昨天误删了一整段',
  'safe.sc2': '程序 bug 弄乱了数据库',
  'safe.sc3': '电脑硬盘坏了',
  'safe.l0.h': '自动保存',
  'safe.l0.p': '停止输入约一秒后保存；切换章节或离开页面时立即保存。',
  'safe.l1.h': '快照',
  'safe.l1.p': '每个章节的历史版本，在编辑过程中，以及任何替换或恢复之前自动生成。',
  'safe.l2.h': '每小时数据库备份',
  'safe.l2.p': '每次启动，以及有改动后每小时，生成一份完整且一致的副本，保留最新 20 份。',
  'safe.l3.h': '冷备份',
  'safe.l3.p':
    '每本书一个可直接阅读的 JSON 文件，附带 SHA-256 校验，保存在你选定的文件夹里——最好在另一块磁盘上。',
  'safe.term': '不用本应用也能读取备份',

  'start.eyebrow': '开始使用',
  'start.h2': '在你自己的电脑上运行',
  'start.p':
    'NovelStudio 是一个小型 Node 服务加浏览器界面，全部运行在你的机器上。本页只是导览——没有托管的在线版本，这正是它的意义所在。',
  'start.s1.h': '安装 Node.js 24 或更高版本',
  'start.s1.p': '具体版本固定在 <code>.nvmrc</code> 中。',
  'start.s2.h': '获取代码并构建',
  'start.s3.h': '开始写作',
  'start.s3.p':
    '在 Mac 上，也可以直接双击 <code>NovelStudio.command</code>。你的书稿保存在 <code>~/Library/Application Support/NovelStudio/</code>。',
  'start.guide': '阅读图文用户指南',
  'start.repo': '在 GitHub 查看',

  'road.eyebrow': '它是怎样做出来的',
  'road.h2': '一次一个里程碑，个个都已验收',
  'road.p':
    '每一步都以类型检查、代码检查、单元与接口测试、端到端测试以及人工验收收尾，才进入下一步。',
  'road.m0': '骨架与安全',
  'road.m1': '书库',
  'road.m2': '目录树逻辑与接口',
  'road.m3': '拖放侧边栏',
  'road.m4': '编辑器、自动保存、冷备份',
  'road.m5': '设定集',
  'road.m6': '故事地图',
  'road.m7': '伏笔追踪',
  'road.m7b': '正文内伏笔锚点',
  'road.m8': '打磨、导入与导出',
  'road.m9': '评审修复',
  'road.m10': '英文 / 简体中文界面',
  'road.m11': '插图',

  'foot.tag': '一款个人的、本地优先的写作应用。',
  'foot.label': '链接',
  'foot.repo': 'GitHub',
  'foot.guide': '用户指南',
  'foot.prd': '需求文档',
  'foot.license': 'MIT 协议',
  'foot.note': '本页不加载任何第三方脚本、字体或追踪器，只会在你的浏览器里记住你选择的语言和主题。',
};

export const dynamic = {
  en: {
    moves: (n) => (n === 0 ? 'Drag a chapter to begin' : n === 1 ? '1 move' : `${n} moves`),
    thread: { moth: 'The silver moth', compass: 'The brass compass' },
    titles: {
      prologue: 'Prologue',
      c1: 'The Last Ferry',
      c2: 'The Locked Room',
      c3: 'A Light for Home',
      c4: 'The Harbour Master’s Ledger',
      c5: 'Tide Tables',
    },
    handle: (title) => `Move “${title}”`,
    moved: (title, pos) => `${title} moved to position ${pos}`,
    noWarnings: 'No warnings — every payoff follows its setup.',
    payoffBefore: (thread) => `${thread}: a payoff comes before its setup.`,
    hintBefore: (thread) => `${thread}: a hint appears before its setup.`,
    copied: 'Copied',
    tour: {
      library: {
        h: 'Your books, at a glance',
        p: 'Every book gets a card with its cover, last-modified date and word count. No cover? One is generated from the title. A card turns amber when a book hasn’t had a cold backup in a while.',
        alt: 'The Library with a book card for The Lantern Road, a New button, sorting options and Trash.',
      },
      manuscript: {
        h: 'Write in the middle',
        p: 'A clean rich-text editor with just the formatting a novel needs. Chapters on the left, a short synopsis, status and linked characters on the right. It saves itself about a second after you stop typing.',
        alt: 'The manuscript workspace with a chapter list, story text and a details panel.',
      },
      pictures: {
        h: 'Pictures that never break your layout',
        p: 'Drop in scene art or character portraits. An image always sits on a line of its own, in three sizes, with an optional caption. Remove one from the text and the file is still kept.',
        alt: 'A lighthouse illustration placed between two paragraphs, with a width and caption toolbar.',
      },
      maps: {
        h: 'Plot as a diagram',
        p: 'Node-and-edge maps for plot structure, timelines and character arcs. Link any box to a chapter or a character and jump straight there; auto-layout tidies the tree.',
        alt: 'A plot tree with a selected node, its linked chapter and character, and a details panel.',
      },
      foreshadowing: {
        h: 'Follow every clue to its payoff',
        p: 'Record each thread’s setups, hints and payoffs, then see them chapter by chapter in the matrix. Warnings flag a payoff before its setup, long gaps, or clues stranded in the trash.',
        alt: 'The silver moth thread with a quoted setup in chapter one, a hint in chapter two and a payoff in chapter three.',
      },
      codex: {
        h: 'Characters and worlds, always at hand',
        p: 'Cards for people, places, eras, cultures and more, with custom fields you can add and reorder. Search everything at once, and link entries from maps and chapters.',
        alt: 'A Codex entry for the character Mara Vale with summary and editable fields.',
      },
    },
    rescue: [
      'Layer 1 has you covered: everything you typed was already saved before the tab closed.',
      'Layer 2 has you covered: open the section’s snapshots and restore yesterday’s version. Restoring even snapshots the current text first.',
      'Layer 3 has you covered: restore one of the hourly database copies from Settings. The database it replaces is kept.',
      'Layer 4 has you covered: your cold backup is a plain JSON file in a folder you chose. Restore it as a new book on any copy of the app, or read it with just jq.',
    ],
  },
  'zh-CN': {
    moves: (n) => (n === 0 ? '拖动一章开始' : `已移动 ${n} 次`),
    thread: { moth: '银蛾', compass: '黄铜罗盘' },
    titles: {
      prologue: '序章',
      c1: '最后一班渡船',
      c2: '上锁的房间',
      c3: '归家之灯',
      c4: '港务长的账簿',
      c5: '潮汐表',
    },
    handle: (title) => `移动《${title}》`,
    moved: (title, pos) => `${title} 已移到第 ${pos} 位`,
    noWarnings: '没有警告——每一处回收都在埋设之后。',
    payoffBefore: (thread) => `${thread}：回收出现在埋设之前。`,
    hintBefore: (thread) => `${thread}：暗示出现在埋设之前。`,
    copied: '已复制',
    tour: {
      library: {
        h: '一眼看清你的所有书',
        p: '每本书都有一张卡片，显示封面、最后修改日期和字数。没有封面？会按书名自动生成一个。如果一本书很久没做冷备份，卡片会变成琥珀色提醒你。',
        alt: '书库界面：《灯塔之路》的书卡、“新建”按钮、排序选项和回收站。',
      },
      manuscript: {
        h: '在中间安心写作',
        p: '简洁的富文本编辑器，只保留小说需要的格式。左边是章节，右边是简短梗概、状态和关联人物。停止输入约一秒后自动保存。',
        alt: '稿件工作区：章节列表、正文和详情面板。',
      },
      pictures: {
        h: '插图绝不破坏排版',
        p: '放入场景图或人物肖像。图片永远独占一行，有三种宽度，可加图注。从正文里删掉图片，文件依然保留。',
        alt: '两段文字之间放置的一幅灯塔插图，带有宽度与图注工具栏。',
      },
      maps: {
        h: '把情节画成图',
        p: '用节点与连线绘制情节结构、时间线和人物弧光。任何方框都能关联章节或人物，一点即达；自动布局帮你整理成树。',
        alt: '一张情节树：选中的节点、它关联的章节与人物，以及详情面板。',
      },
      foreshadowing: {
        h: '追踪每条伏笔，直到回收',
        p: '记录每条线索的埋设、暗示与回收，并在矩阵里逐章查看。回收早于埋设、间隔过长，或伏笔落在回收站里，都会得到提醒。',
        alt: '“银蛾”伏笔线索：第一章的埋设、第二章的暗示和第三章的回收，各附原文摘录。',
      },
      codex: {
        h: '人物与世界，随手可查',
        p: '为人物、地点、年代、文化等建立卡片，自定义字段可随时添加和排序。可一次搜索全部条目，并从地图和章节链接到条目。',
        alt: '设定集中人物“Mara Vale”的条目，含简介和可编辑字段。',
      },
    },
    rescue: [
      '第一层接住了你：标签页关闭之前，你输入的内容已经保存了。',
      '第二层接住了你：打开该章节的快照，恢复昨天的版本。恢复之前还会先为当前文字生成快照。',
      '第三层接住了你：在设置里恢复某一份每小时数据库副本，被替换的数据库也会保留。',
      '第四层接住了你：冷备份是你所选文件夹里的纯 JSON 文件。可以在任何一份应用副本里把它恢复为新书，也可以只用 jq 直接读取。',
    ],
  },
};

const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function cn(n) {
  if (n < 10) return DIGITS[n];
  if (n < 20) return `十${DIGITS[n % 10]}`;
  if (n < 100) return `${DIGITS[Math.floor(n / 10)]}十${DIGITS[n % 10]}`;
  return String(n);
}

// Shared by both languages. `crop` trims screenshots that are mostly empty canvas; the lightbox shows them whole.
export const TOUR = {
  library: { shot: '00-library', ids: 'LIB-01 · LIB-04 · LIB-08', crop: '1440 / 540' },
  manuscript: { shot: '03-writing', ids: 'ED-01 · ED-05 · TREE-10' },
  pictures: { shot: '21-picture-in-text', ids: 'IMG-01 · IMG-02 · IMG-07' },
  maps: { shot: '09-story-map', ids: 'MAP-01 · MAP-08', crop: '1440 / 760' },
  foreshadowing: { shot: '10-foreshadowing', ids: 'FS-01 · FS-05 · FS-08', crop: '1440 / 420' },
  codex: { shot: '07-codex', ids: 'CDX-01 · CDX-05' },
};
