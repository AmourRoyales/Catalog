import { getDb } from "@/lib/mongo";
import CadCatalogViewer from "./viewer";

export default async function PublicCadCatalogPage({ params }: { params: { code: string } }) {
  const db = await getDb();
  const catalog = await db.collection("cad_catalogs").findOne({ code: params.code });

  if (!catalog || catalog.status !== "active") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F8FB]">
        <div className="text-center px-6">
          <p className="text-gray-500 mt-4">This catalog is not available.</p>
          <p className="text-sm text-gray-400 mt-1">
            The link may be incorrect, or the catalog has been removed.
          </p>
        </div>
      </div>
    );
  }

  const docs = await db
    .collection("cad_catalog_items")
    .find(
      { catalog_id: catalog._id },
      { projection: { design_id: 1, dataset: 1, design_code: 1, design_type: 1, cad_url: 1, display_order: 1, prices: 1 } }
    )
    .sort({ display_order: 1 })
    .toArray();
  const items = docs.map(({ _id, ...it }) => it) as any[];

  return (
    <CadCatalogViewer
      name={catalog.name}
      metals={catalog.metals}
      showPrice={catalog.show_price}
      showBranding={catalog.show_branding}
      items={items}
    />
  );
}
