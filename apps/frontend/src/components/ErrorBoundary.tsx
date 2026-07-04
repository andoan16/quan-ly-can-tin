import { Component, type ReactNode } from 'react';
import { Result, Button } from 'antd';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary cho toàn app — bắt runtime errors, hiển thị fallback UI
 * thay vì trắng trang. Nút "Thử lại" reset state để user có thể tiếp tục.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="Ứng dụng gặp lỗi"
          subTitle={
            <div style={{ fontSize: 13, color: '#666', maxWidth: 400, margin: '0 auto' }}>
              <p>Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.</p>
              {this.state.error && (
                <details style={{ textAlign: 'left', marginTop: 12 }}>
                  <summary style={{ cursor: 'pointer', color: '#999' }}>Chi tiết lỗi</summary>
                  <pre style={{ fontSize: 11, color: '#ff4d4f', marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {this.state.error.message}
                    {this.state.error.stack && '\n\n' + this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>
          }
          extra={[
            <Button key="retry" type="primary" onClick={this.handleReset}>
              Thử lại
            </Button>,
            <Button key="reload" onClick={() => window.location.reload()}>
              Tải lại trang
            </Button>,
          ]}
        />
      );
    }

    return this.props.children;
  }
}