import { type AppProps } from "next/app";
import { memo } from "react";
import { ErrorBoundary } from "components/pages/ErrorBoundary";
import Metadata from "components/pages/Metadata";
import StyledApp from "components/pages/StyledApp";
import { FileSystemProvider } from "contexts/fileSystem";
import { MenuProvider } from "contexts/menu";
import { ProcessProvider } from "contexts/process";
import { SessionProvider } from "contexts/session";
import { ViewportProvider } from "contexts/viewport";
import ToastRenderer from "components/system/Toast";
import { ToastContext, useToastProvider } from "components/system/Toast/useToast";

const App = ({ Component: Index, pageProps }: AppProps): React.ReactElement => {
  const toastValue = useToastProvider();

  return (
    <ViewportProvider>
      <ProcessProvider>
        <FileSystemProvider>
          <SessionProvider>
            <ToastContext.Provider value={toastValue}>
              <ErrorBoundary>
                <Metadata />
                <StyledApp>
                  <MenuProvider>
                    <Index {...pageProps} />
                  </MenuProvider>
                </StyledApp>
              </ErrorBoundary>
              <ToastRenderer />
            </ToastContext.Provider>
          </SessionProvider>
        </FileSystemProvider>
      </ProcessProvider>
    </ViewportProvider>
  );
};

export default memo(App);
