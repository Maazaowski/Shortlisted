import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="enter max-w-md">
        <p className="label">404</p>
        <h1 className="display mt-3 text-[34px]">Nothing at this address</h1>
        <p className="mt-2 text-ink-2">The application may have been deleted, or the link is wrong.</p>
        <Link href="/board" className="btn btn-primary mt-5">
          Back to the board
        </Link>
      </div>
    </div>
  );
}
