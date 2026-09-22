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

  // When the catalog owner turned pricing off, don't even fetch `prices` —
  // the viewer already hides it, but that alone would still ship the full
  // computed price (and its cost breakdown) in the page's source for
  // anyone who opens dev tools. Not stripping it defeats "no pricing" for
  // a link shared directly with a customer.
  const projection: Record<string, 1> = {
    design_id: 1, dataset: 1, design_code: 1, design_type: 1, cad_url: 1, display_order: 1,
  };
  if (catalog.show_price) projection.prices = 1;

  const docs = await db
    .collection("cad_catalog_items")
    .find({ catalog_id: catalog._id }, { projection })
    .sort({ display_order: 1 })
    .toArray();
  const items = docs.map(({ _id, prices, ...it }) => ({ ...it, prices: prices ?? {} })) as any[];

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
