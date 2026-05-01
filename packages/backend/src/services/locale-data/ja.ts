/**
 * Japanese (ja) locale overrides.
 *
 * Faker's `ja` locale has solid coverage for person/address/internet but falls
 * through to English for music, vehicle, commerce, and many other categories.
 * This module supplies native Japanese arrays for those gaps. Used as the FIRST
 * locale in a chain `[jaOverrides, fakerJa, en]` so anything we define here
 * wins; anything missing falls back gracefully.
 *
 * NOTE: Trademarked entries (real car manufacturers/models, brand names) are
 * intentionally kept here and NOT contributed upstream. Generic cultural vocab
 * is contributable.
 */

import type { LocaleDefinition } from '@faker-js/faker';

export const jaOverrides: LocaleDefinition = {
  metadata: {
    title: 'Japanese (overrides)',
    code: 'ja',
    language: 'ja',
    endonym: '日本語',
    dir: 'ltr',
    script: 'Jpan',
  },

  music: {
    genre: [
      'ロック', 'ポップ', 'J-Pop', 'アニソン', '演歌', 'ジャズ', 'クラシック',
      'R&B', 'ヒップホップ', 'レゲエ', 'メタル', 'パンク', 'フォーク',
      'エレクトロ', 'テクノ', 'ハウス', 'アンビエント', 'シティポップ',
      'ボーカロイド', 'ブルース', 'インディーズ', 'オルタナティブ',
      'カントリー', 'ラテン', 'クラブミュージック',
    ],
    songName: [
      '春の夢', '東京ラプソディ', '夜空の彼方', '桜雨', '永遠の約束', '光のかけら',
      '青い記憶', '花火の夜', '月明かりの下で', '風の道', '海の歌',
      '星屑のメロディ', '雪の足跡', '風鈴の音', '路地裏のブルース',
    ],
  },

  vehicle: {
    manufacturer: [
      'トヨタ', 'ホンダ', '日産', 'スバル', 'マツダ', 'スズキ', 'ダイハツ',
      'いすゞ', '三菱', 'レクサス', 'ヤマハ', 'カワサキ',
    ],
    model: [
      'カムリ', 'シビック', 'スカイライン', 'インプレッサ', 'ロードスター',
      'スイフト', 'タント', 'プリウス', 'アクア', 'ノート', 'セレナ',
      'フォレスター', 'CX-5', 'アルファード', 'ヴェゼル',
    ],
    type: [
      'セダン', 'ハッチバック', 'ミニバン', 'SUV', '軽自動車', 'スポーツカー',
      'ワゴン', 'クーペ', 'コンパクト',
    ],
    fuel: ['ガソリン', 'ディーゼル', 'ハイブリッド', '電気', '水素'],
  },

  commerce: {
    department: [
      '食品', '飲料', '家電', '衣料品', '書籍', '化粧品', '玩具', '文房具',
      'スポーツ用品', '日用品', 'ペット用品', 'ガーデニング', '家具',
      'インテリア', 'キッチン用品',
    ],
    productName: {
      adjective: [
        '高級', '伝統的', '革新的', '上品', 'シンプル', '優雅', '頑丈',
        '軽量', '快適', '機能的', '上質', '実用的', 'モダン',
      ],
      material: [
        '木製', '陶器', '漆塗り', '竹', '和紙', '絹', '綿', 'ステンレス',
        '革', 'プラスチック', 'ガラス', '金属',
      ],
      product: [
        '湯のみ', '茶碗', '箸', '扇子', '風呂敷', '座布団', '提灯',
        '急須', '皿', '丼', '鍋', '布団', '畳', '障子', '掛け軸',
      ],
    },
  },

  company: {
    suffix: ['株式会社', '有限会社', '合同会社', '合資会社', '株式', 'グループ'],
    name: {
      pattern: ['{{company.suffix}} {{person.lastName}}'],
    },
    catchPhrase: {
      adjective: ['革新的な', '次世代の', '信頼できる', '効率的な', '柔軟な', '統合された', 'スケーラブルな'],
      descriptor: ['ソリューション', 'プラットフォーム', 'サービス', 'システム', 'インフラ', 'ネットワーク'],
      noun: ['アーキテクチャ', 'インターフェース', 'メソドロジー', 'パラダイム', 'プロトコル'],
    },
  },

  food: {
    dish: [
      '寿司', 'ラーメン', '天ぷら', 'うどん', 'そば', '焼き鳥', 'お好み焼き',
      'たこ焼き', '親子丼', '牛丼', 'カレーライス', 'とんかつ', 'すき焼き',
      'しゃぶしゃぶ', '刺身', '味噌汁', 'おにぎり',
    ],
    ingredient: [
      '醤油', '味噌', 'みりん', '出汁', 'わさび', '海苔', '昆布', '豆腐',
      '納豆', '梅干し', '鰹節',
    ],
  },

  color: {
    human: [
      '赤', '青', '緑', '黄色', '黒', '白', '紫', 'ピンク', 'オレンジ', '茶色',
      '灰色', '金色', '銀色', '紺', '藤色', '桜色', '抹茶色',
    ],
  },

  animal: {
    dog: ['柴犬', '秋田犬', '土佐犬', 'ポメラニアン', 'プードル', 'チワワ', 'ダックスフンド'],
    cat: ['三毛猫', '黒猫', 'ペルシャ猫', 'ロシアンブルー', 'スコティッシュフォールド'],
    bird: ['雀', '鳩', '鶴', '鶯', 'ふくろう', 'カラス', 'ツバメ', '鴨'],
  },

  hacker: {
    abbreviation: ['API', 'CPU', 'GPU', 'SSD', 'TCP', 'UDP', 'JSON', 'HTTP', 'HTTPS', 'DNS'],
    noun: [
      'プロトコル', 'インターフェース', 'バンド幅', 'ファイアウォール',
      'システム', 'ドライバ', 'プロセッサ', 'マイクロチップ',
    ],
    verb: [
      '解析する', '圧縮する', '同期する', 'バックアップする', 'パースする',
      'ナビゲートする', '構築する', '統合する',
    ],
  },
};
