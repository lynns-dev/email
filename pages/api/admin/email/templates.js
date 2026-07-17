import { getTemplates, createTemplate, deleteTemplate } from '../../../../lib/templatesStore';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const templates = await getTemplates();
      return res.status(200).json({ templates });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { name, blocks } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Template name is required.' });
    if (!Array.isArray(blocks) || blocks.length === 0) return res.status(400).json({ error: 'Add at least one block before saving.' });
    try {
      const template = await createTemplate({ name: name.trim(), blocks });
      return res.status(200).json({ template });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Template id is required.' });
    try {
      const templates = await deleteTemplate(id);
      return res.status(200).json({ templates });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
