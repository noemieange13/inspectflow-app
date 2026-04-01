export default function Page({ params }: any) {
  return (
    <div>
      Report ID: {params?.id}
    </div>
  );
}