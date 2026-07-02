export default function DevelopmentDraftBanner() {
  return (
    <div
      className="mb-4 rounded-lg border-2 border-orange-400 bg-orange-50 px-4 py-3 text-center text-sm text-orange-950"
      role="status"
    >
      <p className="font-bold">Development Draft</p>
      <p className="font-semibold">Offline Development Mode</p>
      <p className="mt-1 text-xs font-normal text-orange-900">
        No database synchronization
      </p>
    </div>
  );
}
