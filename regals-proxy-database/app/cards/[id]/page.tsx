import CardDetail from "./card-detail";

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <CardDetail cardId={id} />;
}
