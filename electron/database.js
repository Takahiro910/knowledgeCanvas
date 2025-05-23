const { app } = require('electron');
const path = require('path');
const knex = require('knex');

// データベースファイルのパスをユーザーデータディレクトリ内に設定
// これにより、インストール後もユーザーごとにデータが保持されます。
const dbPath = path.join(app.getPath('userData'), 'knowledge-canvas.sqlite3');

const db = knex({
  client: 'sqlite3',
  connection: {
    filename: dbPath,
  },
  useNullAsDefault: true, // SQLiteでデフォルト値をNULLにするため
});

// データベースの初期化（テーブル作成）
async function initDatabase() {
  try {
    const hasNodesTable = await db.schema.hasTable('nodes');
    if (!hasNodesTable) {
      await db.schema.createTable('nodes', (table) => {
        table.string('id').primary();
        table.string('type').notNullable();
        table.json('position').notNullable(); // { x: number, y: number }
        table.json('data').notNullable();     // { label: string, content?: string, fileType?: string, ... }
        table.timestamp('createdAt').defaultTo(db.fn.now());
      });
      console.log('Created "nodes" table.');
    }

    const hasLinksTable = await db.schema.hasTable('links');
    if (!hasLinksTable) {
      await db.schema.createTable('links', (table) => {
        table.string('id').primary();
        table.string('source').notNullable().references('id').inTable('nodes').onDelete('CASCADE');
        table.string('target').notNullable().references('id').inTable('nodes').onDelete('CASCADE');
        table.timestamp('createdAt').defaultTo(db.fn.now());
      });
      console.log('Created "links" table.');
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error; // エラーを投げてメインプロセスに知らせる
  }
}

// --- ノード操作 ---
const getAllNodes = () => db('nodes').select('*');
const addNode = (node) => db('nodes').insert(node);
const updateNodePosition = (id, position) => db('nodes').where({ id }).update({ position });
const updateNodeData = (id, data) => db('nodes').where({ id }).update({ data: JSON.stringify(data) }); // dataをJSON文字列化
const deleteNode = (id) => db('nodes').where({ id }).del();

// --- リンク操作 ---
const getAllLinks = () => db('links').select('*');
const addLink = (link) => db('links').insert(link);
const deleteLink = (id) => db('links').where({ id }).del();
// リンクはIDでの削除より、ソース/ターゲットでの削除が実用的かもしれない
const deleteLinksByNodeId = (nodeId) => db('links').where({ source: nodeId }).orWhere({ target: nodeId }).del();


module.exports = {
  initDatabase,
  getAllNodes,
  addNode,
  updateNodePosition,
  updateNodeData,
  deleteNode,
  getAllLinks,
  addLink,
  deleteLink,
  deleteLinksByNodeId,
  dbPath, // パスもエクスポートしておくと便利
};