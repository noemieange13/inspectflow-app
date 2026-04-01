export default function Page({ params }: { params: { id: string } }) {
  return (
    <div>
      Report ID: {params.id}
    </div>
  );
}