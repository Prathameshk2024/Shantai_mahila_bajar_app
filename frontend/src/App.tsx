import type { ReactNode } from 'react'
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import type { Role } from '@shared/types.js'
import { I18nProvider } from './i18n/I18nProvider.js'
import { AuthProvider, useAuth } from './store/AuthContext.js'
import { CartProvider } from './store/CartContext.js'
import { CustomerLayout, SellerLayout } from './components/layouts.js'
import Landing from './screens/landing/Landing.js'
import { OtpScreen, PhoneScreen } from './screens/auth/Auth.js'
import SellerRegister from './screens/auth/SellerRegister.js'
import MyBusiness from './screens/seller/MyBusiness.js'
import MyProducts from './screens/seller/MyProducts.js'
import UploadProduct from './screens/seller/UploadProduct.js'
import { SellerOrderDetail, SellerOrders } from './screens/seller/Orders.js'
import { PaymentWaiting, Subscription } from './screens/seller/Subscription.js'
import { SellerGrowth, SellerHelp, SellerProfile } from './screens/seller/Misc.js'
import { Categories, CategoryProducts, Explore, ProductDetail, SellerStore } from './screens/customer/Browse.js'
import { Cart, Checkout, CustomerOrders, CustomerProfile, OrderPlaced, TrackOrder } from './screens/customer/CartCheckout.js'

function Require({role,children}:{role:Role;children:ReactNode}){const{session}=useAuth();if(!session)return <Navigate to="/" replace/>;if(session.role!==role)return <Navigate to="/" replace/>;return <>{children}</>}
function Root(){const{session}=useAuth();if(session?.role==='seller')return <Navigate to="/seller" replace/>;if(session?.role==='customer')return <Navigate to="/shop" replace/>;return <Landing/>}
export default function App(){return <I18nProvider><AuthProvider><CartProvider><Router><Routes><Route path="/" element={<Root/>}/><Route path="/join/:role" element={<PhoneScreen mode="join"/>}/><Route path="/login/:role" element={<PhoneScreen mode="login"/>}/><Route path="/otp/:role" element={<OtpScreen/>}/><Route path="/register/seller" element={<SellerRegister/>}/><Route path="/seller/waiting" element={<Require role="seller"><PaymentWaiting/></Require>}/><Route path="/seller" element={<Require role="seller"><SellerLayout/></Require>}><Route index element={<MyBusiness/>}/><Route path="orders" element={<SellerOrders/>}/><Route path="orders/:orderId" element={<SellerOrderDetail/>}/><Route path="products" element={<MyProducts/>}/><Route path="upload" element={<UploadProduct/>}/><Route path="subscription" element={<Subscription/>}/><Route path="profile" element={<SellerProfile/>}/><Route path="help" element={<SellerHelp/>}/><Route path="growth" element={<SellerGrowth/>}/></Route><Route path="/shop/placed/:orderId" element={<Require role="customer"><OrderPlaced/></Require>}/><Route path="/shop" element={<Require role="customer"><CustomerLayout/></Require>}><Route index element={<Explore/>}/><Route path="categories" element={<Categories/>}/><Route path="c/:categoryId" element={<CategoryProducts/>}/><Route path="p/:productId" element={<ProductDetail/>}/><Route path="s/:slug" element={<SellerStore/>}/><Route path="cart" element={<Cart/>}/><Route path="checkout" element={<Checkout/>}/><Route path="orders" element={<CustomerOrders/>}/><Route path="orders/:orderId" element={<TrackOrder/>}/><Route path="profile" element={<CustomerProfile/>}/></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Router></CartProvider></AuthProvider></I18nProvider>}
