import { getDb } from "@/lib/mongo";
import { parseCarat } from "@/lib/carat";
import CatalogueViewer from "./viewer";

export default async function PublicCataloguePage({
  params,
}: {
  params: { token: string };
}) {
  const db = await getDb();
  const catalogue = await db.collection("catalogues").findOne({ share_token: params.token });

  if (!catalogue || catalogue.status !== "active") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F8FB]">
        <div className="text-center px-6">
          <p className="text-gray-500 mt-4">
            This catalogue is not available.
          </p>
          <p className="text-sm text-gray-400 mt-1">
            The link may be incorrect, or the catalogue has been removed.
          </p>
        </div>
      </div>
    );
  }

  // Flatten, sort by display order, keep only active products.
  // Each product's price uses its catalogue-specific override if one
  // exists (price_override), otherwise falls back to the base price.
  // Carat weight is read from the description (used for sorting).
  const links = ((catalogue.catalogue_products ?? []) as {
    product_id: string;
    display_order: number;
    price_override: number | null;
  }[]).sort((x, y) => x.display_order - y.display_order);
  const docs = await db
    .collection("products")
    .find({ _id: { $in: links.map((l) => l.product_id) as any[] }, status: "active" })
    .toArray();
  const byId = new Map(docs.map((d) => [String(d._id), d]));

  const products: any[] = links
    .filter((l) => byId.has(l.product_id))
    .map((l) => {
      const { _id, created_by, created_at, ...p } = byId.get(l.product_id)!;
      return {
        id: String(_id),
        ...p,
        price: l.price_override ?? p.price,
        carat: parseCarat(p.description),
        product_media: ((p.product_media ?? []) as { sort_order: number }[])
          .slice()
          .sort((x, y) => x.sort_order - y.sort_order),
      };
    });

  return (
    <CatalogueViewer
      name={catalogue.name}
      showPrice={catalogue.show_price}
      showDescription={catalogue.show_description}
      showBranding={catalogue.show_branding}
      products={products}
    />
  );
}