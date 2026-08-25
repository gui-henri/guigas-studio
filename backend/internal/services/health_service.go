package services

import (
	"context"

	"connectrpc.com/connect"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	studiov1connect "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1/studiov1connect"
)

// HealthService implements studio.v1.HealthService.
type HealthService struct{}

// NewHealthService returns the Connect handler for HealthService.
func NewHealthService() studiov1connect.HealthServiceHandler {
	return &HealthService{}
}

// Check reports the API as serving.
func (s *HealthService) Check(
	ctx context.Context,
	req *connect.Request[studiov1.CheckRequest],
) (*connect.Response[studiov1.CheckResponse], error) {
	return connect.NewResponse(&studiov1.CheckResponse{Status: "serving"}), nil
}
