import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="text-center py-16" data-testid="not-found-page">
      <h1 className="text-3xl font-bold text-gray-900">Page not found</h1>
      <p className="mt-3 text-sm text-gray-600">
        That route does not exist. Head back to the pools dashboard.
      </p>
      <Link
        to="/pools"
        className="mt-6 inline-flex px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
      >
        Back to pools
      </Link>
    </div>
  );
}
