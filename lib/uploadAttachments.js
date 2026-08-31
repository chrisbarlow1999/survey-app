// Uploads any newly-picked attachments and passes through ones already saved,
// returning the array to store on the record. Shared by the new/edit forms for
// both surveys and installations so they stay consistent.
export async function uploadAttachments(supabase, attachments) {
  const saved = [];
  for (const a of attachments) {
    if (a.file) {
      const safeName = a.file.name.replace(/[^\w.\-]/g, '_');
      const path = `attachments/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
      const { error } = await supabase.storage
        .from('survey-photos')
        .upload(path, a.file, { contentType: a.file.type || 'application/octet-stream' });
      if (error) throw error;
      saved.push({ path, name: a.file.name, size: a.file.size, type: a.file.type || '' });
    } else if (a.existingPath) {
      saved.push({ path: a.existingPath, name: a.name, size: a.size, type: a.type || '' });
    }
  }
  return saved;
}

export function attachmentsFromExisting(list) {
  return (list || []).map((a, i) => ({
    key: `existing_${i}`,
    existingPath: a.path,
    name: a.name,
    size: a.size,
    type: a.type,
  }));
}

export function newAttachmentItems(files) {
  return files.map((file) => ({ key: 'att_' + Math.random().toString(36).slice(2, 9), file }));
}
