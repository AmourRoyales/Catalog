import CadCatalogEditor from "@/components/cad/CadCatalogEditor";

export default function EditCadCatalogPage({ params }: { params: { id: string } }) {
  return <CadCatalogEditor catalogId={params.id} />;
}
