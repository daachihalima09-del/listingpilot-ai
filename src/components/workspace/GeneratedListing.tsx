interface GeneratedListingProps {
  content: {
    title: string;
    description: string;
    keyFeatures: string;
    seoTitle: string;
    seoDescription: string;
    tags: string;
  };
  onChange: (field: keyof GeneratedListingProps['content'], value: string) => void;
  readOnly?: boolean;
}

export function GeneratedListing({
  content,
  onChange,
  readOnly = false,
}: GeneratedListingProps) {
  const fields: Array<{ key: keyof GeneratedListingProps['content']; label: string; multiline?: boolean }> = [
    { key: 'title', label: 'Product title' },
    { key: 'description', label: 'Description', multiline: true },
    { key: 'keyFeatures', label: 'Key features', multiline: true },
    { key: 'seoTitle', label: 'SEO title' },
    { key: 'seoDescription', label: 'SEO description', multiline: true },
    { key: 'tags', label: 'Tags' },
  ];

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[#081423] p-5">
      <div className="text-sm font-semibold text-slate-100">Generated listing</div>
      <div className="mt-4 space-y-3">
        {fields.map((field) => (
          <label key={field.key} className="block text-sm text-slate-300">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">{field.label}</span>
            {field.multiline ? (
              <textarea
                value={content[field.key]}
                onChange={(event) => onChange(field.key, event.target.value)}
                disabled={readOnly}
                className="min-h-24 w-full rounded-xl border border-white/10 bg-[#07111f] px-3 py-3 text-sm text-slate-200 outline-none"
              />
            ) : (
              <input
                value={content[field.key]}
                onChange={(event) => onChange(field.key, event.target.value)}
                disabled={readOnly}
                className="w-full rounded-xl border border-white/10 bg-[#07111f] px-3 py-3 text-sm text-slate-200 outline-none"
              />
            )}
          </label>
        ))}
      </div>
    </section>
  );
}
