import EditProductPage from "./edit-client";

export const instant = false;

export default async function Page({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return <EditProductPage productId={productId} />;
}
